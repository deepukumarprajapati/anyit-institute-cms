import { Types } from 'mongoose';
import { Request } from 'express';
import { AcademicSession } from '../models/AcademicSession';
import { Enrollment, Student } from '../models/Student';
import { FeeInvoice, FeePayment } from '../models/Fee';
import { StudentAttendance } from '../models/Attendance';
import { Event } from '../models/Event';
import {
  AcademicMark,
  Complaint,
  EventParticipation,
  MedicalRecord,
  UnitTestReport,
} from '../models/StudentProfile';
import { StudentTransport } from '../models/Transport';
import { AppError } from '../utils/errors';
import { instituteFilter } from '../utils/query';

function monthKeyFromDate(d?: Date | null) {
  if (!d) return 'unknown';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Calendar month in local time — for when a payment was actually received */
function monthKeyFromLocalDate(d?: Date | null) {
  if (!d) return 'unknown';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

async function feeLedgerForStudent(req: Request, studentId: string, sessionId?: string) {
  const filter: Record<string, unknown> = {
    ...instituteFilter(req),
    studentId,
    status: { $in: ['issued', 'partial', 'paid'] },
    deletedAt: null,
    ...(sessionId ? { sessionId } : {}),
  };
  const invoices = await FeeInvoice.find(filter).sort('billingMonth dueDate createdAt').lean();
  const session = sessionId
    ? await AcademicSession.findById(sessionId).select('name isActive startDate endDate').lean()
    : null;
  /** Prior years are closed once the student is in a later/current session — no live pending. */
  const yearClosed = Boolean(session && session.isActive === false);

  const invoiceIds = invoices.map((i) => i._id);
  const payments = invoiceIds.length
    ? await FeePayment.find({
        ...instituteFilter(req),
        studentId,
        invoiceId: { $in: invoiceIds },
      })
        .sort('-paidAt')
        .lean()
    : [];

  const invoiceNoById = new Map(invoices.map((i) => [String(i._id), i.invoiceNo]));
  const paymentsByInvoice = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = String(p.invoiceId);
    if (!paymentsByInvoice.has(key)) paymentsByInvoice.set(key, []);
    paymentsByInvoice.get(key)!.push(p);
  }

  const byMonthMap = new Map<
    string,
    {
      month: string;
      pendingAmount: number;
      totalAmount: number;
      paidAmount: number;
      byCategory: Record<string, number>;
      /** Best invoice to pay against for each pending category */
      categoryTargets: Record<
        string,
        {
          invoiceId: string;
          invoiceNo: string;
          itemName: string;
          categoryPending: number;
          invoicePending: number;
        }
      >;
      invoices: {
        _id: string;
        invoiceNo: string;
        status: string;
        pendingAmount: number;
        totalAmount: number;
        paidAmount: number;
      }[];
      /** Payments against this month’s invoices (for month-end ledger math) */
      ledgerPayments: {
        _id: string;
        receiptNo: string;
        amount: number;
        paidAt: Date;
        method?: string;
        invoiceId: string;
        invoiceNo?: string;
      }[];
      payments: {
        _id: string;
        receiptNo: string;
        amount: number;
        paidAt: Date;
        method?: string;
        invoiceId: string;
        invoiceNo?: string;
      }[];
    }
  >();

  let advancePaid = 0;
  const advanceEntries: {
    _id: string;
    invoiceNo: string;
    amount: number;
    billingMonth: string;
    paidAt: Date | null;
    description: string;
  }[] = [];

  const invoiceSourceById = new Map(
    invoices.map((i) => [String(i._id), (i as { source?: string }).source || 'manual'])
  );

  function ensureMonth(month: string) {
    if (!byMonthMap.has(month)) {
      byMonthMap.set(month, {
        month,
        pendingAmount: 0,
        totalAmount: 0,
        paidAmount: 0,
        byCategory: {},
        categoryTargets: {},
        invoices: [],
        ledgerPayments: [],
        payments: [],
      });
    }
    return byMonthMap.get(month)!;
  }

  for (const inv of invoices) {
    const source = (inv as { source?: string }).source;
    if (source === 'advance') {
      const amt = Math.round(Number(inv.paidAmount || inv.totalAmount || 0) * 100) / 100;
      advancePaid += amt;
      const invPayments = paymentsByInvoice.get(String(inv._id)) || [];
      advanceEntries.push({
        _id: String(inv._id),
        invoiceNo: inv.invoiceNo,
        amount: amt,
        billingMonth:
          inv.billingMonth ||
          monthKeyFromDate(inv.dueDate) ||
          monthKeyFromDate((inv as { createdAt?: Date }).createdAt),
        paidAt: invPayments[0]?.paidAt || null,
        description:
          (inv.items?.[0] as { description?: string } | undefined)?.description ||
          inv.items?.[0]?.name ||
          'Advance payment',
      });
      continue;
    }

    const pending = Math.max(0, inv.totalAmount - inv.paidAmount);
    const ratio = inv.totalAmount > 0 ? pending / inv.totalAmount : 0;
    const month =
      inv.billingMonth ||
      monthKeyFromDate(inv.dueDate) ||
      monthKeyFromDate((inv as { createdAt?: Date }).createdAt);

    const m = ensureMonth(month);
    m.pendingAmount += pending;
    m.totalAmount += inv.totalAmount;
    m.paidAmount += inv.paidAmount;
    m.invoices.push({
      _id: String(inv._id),
      invoiceNo: inv.invoiceNo,
      status: inv.status,
      pendingAmount: pending,
      totalAmount: inv.totalAmount,
      paidAmount: inv.paidAmount,
    });

    for (const p of paymentsByInvoice.get(String(inv._id)) || []) {
      m.ledgerPayments.push({
        _id: String(p._id),
        receiptNo: p.receiptNo,
        amount: p.amount,
        paidAt: p.paidAt,
        method: p.method,
        invoiceId: String(p.invoiceId),
        invoiceNo: invoiceNoById.get(String(p.invoiceId)),
      });
    }

    for (const item of inv.items || []) {
      const cat = item.category || 'other';
      const linePending = Math.round(item.amount * ratio * 100) / 100;
      if (linePending > 0) {
        m.byCategory[cat] = (m.byCategory[cat] || 0) + linePending;
        const existing = m.categoryTargets[cat];
        if (!existing) {
          m.categoryTargets[cat] = {
            invoiceId: String(inv._id),
            invoiceNo: inv.invoiceNo,
            itemName: item.name,
            categoryPending: linePending,
            invoicePending: pending,
          };
        } else {
          existing.categoryPending += linePending;
          // Prefer invoice with the largest remaining balance for collection
          if (pending > existing.invoicePending) {
            existing.invoiceId = String(inv._id);
            existing.invoiceNo = inv.invoiceNo;
            existing.itemName = item.name;
            existing.invoicePending = pending;
          }
        }
      }
    }
  }

  /**
   * "Payments this month" = when cash was received (paidAt), not invoice billing month.
   * Catch-up / advance payments then show under the month the parent actually paid.
   */
  type MonthPay = {
    _id: string;
    receiptNo: string;
    amount: number;
    paidAt: Date;
    method?: string;
    invoiceId: string;
    invoiceNo?: string;
    paymentBatchId?: string;
    kind?: string;
  };
  const paymentsByPaidMonth = new Map<string, MonthPay[]>();

  for (const p of payments) {
    const paidMonth = monthKeyFromLocalDate(p.paidAt);
    if (!paidMonth || paidMonth === 'unknown') continue;
    ensureMonth(paidMonth);
    const list = paymentsByPaidMonth.get(paidMonth) || [];
    list.push({
      _id: String(p._id),
      receiptNo: p.receiptNo,
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      invoiceId: String(p.invoiceId),
      invoiceNo: invoiceNoById.get(String(p.invoiceId)),
      paymentBatchId: (p as { paymentBatchId?: string }).paymentBatchId,
      kind: invoiceSourceById.get(String(p.invoiceId)) === 'advance' ? 'advance' : 'fee',
    });
    paymentsByPaidMonth.set(paidMonth, list);
  }

  function groupMonthPayments(rows: MonthPay[]) {
    const groups = new Map<
      string,
      MonthPay & { allocationCount: number; invoiceNos: string[] }
    >();
    for (const p of rows) {
      const studentPaidAt = new Date(p.paidAt).getTime();
      const key =
        p.paymentBatchId ||
        `${studentPaidAt}|${p.method || ''}|${p.receiptNo}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          ...p,
          receiptNo: p.paymentBatchId || p.receiptNo,
          allocationCount: 1,
          invoiceNos: p.invoiceNo ? [p.invoiceNo] : [],
        });
      } else {
        existing.amount = Math.round((existing.amount + Number(p.amount)) * 100) / 100;
        existing.allocationCount += 1;
        if (p.invoiceNo && !existing.invoiceNos.includes(p.invoiceNo)) {
          existing.invoiceNos.push(p.invoiceNo);
        }
        if (p.paymentBatchId && p.receiptNo === p.paymentBatchId) {
          existing.receiptNo = p.receiptNo;
          existing._id = p._id;
        }
      }
    }
    return Array.from(groups.values())
      .map((g) => ({
        _id: g._id,
        receiptNo: g.receiptNo,
        amount: g.amount,
        paidAt: g.paidAt,
        method: g.method,
        invoiceId: g.invoiceId,
        invoiceNo:
          g.invoiceNos.length > 1
            ? `${g.invoiceNos.length} invoices`
            : g.invoiceNos[0] || g.invoiceNo,
        kind: g.kind,
        allocationCount: g.allocationCount,
      }))
      .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }

  const byMonth = Array.from(byMonthMap.values())
    .map((m) => {
      const livePending = Math.round(m.pendingAmount * 100) / 100;
      const monthPayments = groupMonthPayments(paymentsByPaidMonth.get(m.month) || []);
      const paymentsReceived = Math.round(
        monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0) * 100
      ) / 100;
      return {
        ...m,
        // Closed years: keep billed/paid history, but do not surface live pending
        pendingAmount: yearClosed ? 0 : livePending,
        openPendingAmount: livePending,
        totalAmount: Math.round(m.totalAmount * 100) / 100,
        paidAmount: Math.round(m.paidAmount * 100) / 100,
        paymentsReceived,
        ledgerPayments: m.ledgerPayments,
        payments: monthPayments,
      };
    })
    .sort((a, b) => a.month.localeCompare(b.month));

  // Single source of truth: year pending = sum of month pending (0 when year closed)
  const totalPending = Math.round(byMonth.reduce((s, m) => s + m.pendingAmount, 0) * 100) / 100;
  const openPendingBeforeClose = Math.round(
    byMonth.reduce((s, m) => s + Number(m.openPendingAmount || 0), 0) * 100
  ) / 100;
  const totalPaid = Math.round(byMonth.reduce((s, m) => s + m.paidAmount, 0) * 100) / 100;
  const totalBilled = Math.round(byMonth.reduce((s, m) => s + m.totalAmount, 0) * 100) / 100;
  advancePaid = Math.round(advancePaid * 100) / 100;

  return {
    summary: {
      totalPending,
      totalPaid,
      totalBilled,
      advancePaid,
      yearClosed,
      closedPendingAmount: yearClosed ? openPendingBeforeClose : 0,
      monthsPendingCount: byMonth.filter((m) => m.pendingAmount > 0).length,
      openInvoiceCount: yearClosed
        ? 0
        : invoices.filter(
            (i) =>
              (i as { source?: string }).source !== 'advance' &&
              (i.status === 'issued' || i.status === 'partial')
          ).length,
      paymentCount: payments.length,
    },
    byMonth,
    advancePayments: advanceEntries.sort((a, b) => {
      const at = a.paidAt ? new Date(a.paidAt).getTime() : 0;
      const bt = b.paidAt ? new Date(b.paidAt).getTime() : 0;
      return bt - at;
    }),
    invoices,
    otherFees: invoices
      .filter((i) => (i as { source?: string }).source === 'adhoc')
      .map((i) => {
        const item = i.items?.[0];
        const invPayments = paymentsByInvoice.get(String(i._id)) || [];
        const paidAt = invPayments[0]?.paidAt || null;
        return {
          _id: String(i._id),
          invoiceNo: i.invoiceNo,
          title: item?.name || 'Other fee',
          description: (item as { description?: string } | undefined)?.description || '',
          amount: i.totalAmount,
          paidAmount: i.paidAmount,
          pendingAmount: Math.max(0, i.totalAmount - i.paidAmount),
          status: i.status,
          billingMonth: i.billingMonth || monthKeyFromDate(i.dueDate) || monthKeyFromDate(i.createdAt),
          submittedAt: i.createdAt || null,
          paidAt,
        };
      })
      .sort((a, b) => {
        const at = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bt = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bt - at;
      }),
    payments,
  };
}

async function sectionBundle(req: Request, studentId: string, sessionId?: string) {
  if (!sessionId) {
    return {
      fees: null as Awaited<ReturnType<typeof feeLedgerForStudent>> | null,
      complaints: [] as unknown[],
      medical: [] as unknown[],
      marks: [] as unknown[],
      unitTests: [] as unknown[],
      eventParticipations: [] as unknown[],
      eventPhotos: [] as unknown[],
      attendance: { total: 0, present: 0, percentage: 0, items: [] as unknown[] },
    };
  }

  const [fees, complaints, medical, marks, unitTests, eventParticipations, attendanceItems] =
    await Promise.all([
      feeLedgerForStudent(req, studentId, sessionId),
      Complaint.find({ ...instituteFilter(req), studentId, sessionId }).sort('-raisedOn').lean(),
      MedicalRecord.find({ ...instituteFilter(req), studentId, sessionId })
        .sort('-recordDate')
        .lean(),
      AcademicMark.find({ ...instituteFilter(req), studentId, sessionId }).sort('-examDate').lean(),
      UnitTestReport.find({ ...instituteFilter(req), studentId, sessionId }).sort('-testDate').lean(),
      EventParticipation.find({ ...instituteFilter(req), studentId, sessionId })
        .sort('-eventDate')
        .lean(),
      // Full session attendance — no month/day cap
      StudentAttendance.find({ ...instituteFilter(req), studentId, sessionId }).sort('-date').lean(),
    ]);

  const eventIds = [
    ...new Set(
      eventParticipations
        .map((p) => (p.eventId ? String(p.eventId) : ''))
        .filter(Boolean)
    ),
  ];
  const events = eventIds.length
    ? await Event.find({
        _id: { $in: eventIds },
        ...instituteFilter(req),
      })
        .select('title startAt photos')
        .lean()
    : [];
  const eventById = new Map(events.map((e) => [String(e._id), e]));

  const eventParticipationsEnriched = eventParticipations.map((p) => {
    const ev = p.eventId ? eventById.get(String(p.eventId)) : undefined;
    return {
      ...p,
      photos: ev?.photos || [],
    };
  });

  const eventPhotos: {
    _id: string;
    url: string;
    caption?: string;
    eventId: string;
    eventTitle: string;
    eventDate?: Date;
    role?: string;
  }[] = [];
  for (const p of eventParticipations) {
    if (!p.eventId) continue;
    const ev = eventById.get(String(p.eventId));
    for (const photo of ev?.photos || []) {
      eventPhotos.push({
        _id: String(photo._id),
        url: photo.url,
        caption: photo.caption,
        eventId: String(p.eventId),
        eventTitle: p.eventTitle || ev?.title || 'Event',
        eventDate: p.eventDate || ev?.startAt,
        role: p.role,
      });
    }
  }

  const present = attendanceItems.filter((a) =>
    ['present', 'late', 'half_day'].includes(a.status)
  ).length;
  const total = attendanceItems.length;

  return {
    fees,
    complaints,
    medical,
    marks,
    unitTests,
    eventParticipations: eventParticipationsEnriched,
    eventPhotos,
    attendance: {
      total,
      present,
      percentage: total ? Math.round((present / total) * 1000) / 10 : 0,
      items: attendanceItems,
    },
  };
}

export async function buildStudentProfile(req: Request, studentId: string) {
  if (!Types.ObjectId.isValid(studentId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid student id');
  }

  const student = await Student.findOne({ _id: studentId, ...instituteFilter(req) })
    .populate('campusId', 'name code schoolCode isPrimary')
    .populate('campusHistory.campusId', 'name code schoolCode isPrimary');
  if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

  const sessions = await AcademicSession.find(instituteFilter(req)).sort('-startDate').lean();
  const activeSession = sessions.find((s) => s.isActive) || sessions[0] || null;

  const enrollments = await Enrollment.find({
    ...instituteFilter(req),
    studentId,
  })
    .populate('sessionId', 'name startDate endDate isActive')
    .populate('classId', 'name code')
    .populate('sectionId', 'name')
    .populate({
      path: 'classroomId',
      select: 'name code floorId',
      populate: { path: 'floorId', select: 'name code' },
    })
    .lean();

  enrollments.sort((a, b) => {
    const as = (a.sessionId as { startDate?: Date } | null)?.startDate?.getTime?.() || 0;
    const bs = (b.sessionId as { startDate?: Date } | null)?.startDate?.getTime?.() || 0;
    return bs - as;
  });

  const enrollmentBySession = new Map<string, (typeof enrollments)[number]>();
  for (const e of enrollments) {
    const sid = String((e.sessionId as { _id?: unknown })?._id || e.sessionId);
    if (!enrollmentBySession.has(sid)) enrollmentBySession.set(sid, e);
  }

  // Include every session the student has enrollment or history for (all years)
  const [complaintSessions, medicalSessions, markSessions, unitSessions, eventSessions, feeSessions, attSessions] =
    await Promise.all([
      Complaint.distinct('sessionId', { ...instituteFilter(req), studentId }),
      MedicalRecord.distinct('sessionId', { ...instituteFilter(req), studentId }),
      AcademicMark.distinct('sessionId', { ...instituteFilter(req), studentId }),
      UnitTestReport.distinct('sessionId', { ...instituteFilter(req), studentId }),
      EventParticipation.distinct('sessionId', { ...instituteFilter(req), studentId }),
      FeeInvoice.distinct('sessionId', { ...instituteFilter(req), studentId }),
      StudentAttendance.distinct('sessionId', { ...instituteFilter(req), studentId }),
    ]);

  const historySessionIds = new Set(
    [
      ...enrollmentBySession.keys(),
      ...complaintSessions,
      ...medicalSessions,
      ...markSessions,
      ...unitSessions,
      ...eventSessions,
      ...feeSessions,
      ...attSessions,
    ]
      .filter(Boolean)
      .map((id) => String(id))
  );

  const yearSessions = sessions.filter((s) => historySessionIds.has(String(s._id)));
  // Always surface active session even if empty, so UI has a default
  if (activeSession && !yearSessions.some((s) => String(s._id) === String(activeSession._id))) {
    yearSessions.unshift(activeSession);
  }

  const years = await Promise.all(
    yearSessions.map(async (session) => {
      const sid = String(session._id);
      const data = await sectionBundle(req, studentId, sid);
      return {
        sessionId: sid,
        session,
        enrollment: enrollmentBySession.get(sid) || null,
        isActive: Boolean(session.isActive),
        ...data,
      };
    })
  );

  const transport = await StudentTransport.findOne({
    ...instituteFilter(req),
    studentId,
  })
    .populate('routeId')
    .populate('feeTierId', 'name maxKm monthlyAmount')
    .lean();

  const route = transport?.routeId as { name?: string; stops?: { name: string }[] } | null;
  const tier = transport?.feeTierId as
    | { name?: string; maxKm?: number; monthlyAmount?: number }
    | null;
  const currentYear = years.find((y) => y.isActive) || years[0] || null;

  return {
    student,
    sessions: yearSessions,
    currentSession: activeSession,
    currentEnrollment: currentYear?.enrollment || null,
    enrollments,
    transport: transport
      ? {
          stopName: transport.stopName,
          routeName: route?.name,
          routeId: String(
            (transport.routeId as { _id?: unknown } | null)?._id || transport.routeId || ''
          ),
          feeTierId: transport.feeTierId
            ? String(
                (transport.feeTierId as { _id?: unknown } | null)?._id || transport.feeTierId
              )
            : undefined,
          feeTierName: tier?.name,
          maxKm: tier?.maxKm,
          monthlyFee: transport.monthlyFee ?? tier?.monthlyAmount ?? 0,
        }
      : null,
    years,
  };
}
