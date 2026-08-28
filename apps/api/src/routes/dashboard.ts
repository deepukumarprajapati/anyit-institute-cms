import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { Student, Enrollment } from '../models/Student';
import { Staff } from '../models/Staff';
import { FeeInvoice, FeePayment } from '../models/Fee';
import { Event } from '../models/Event';
import { AcademicSession } from '../models/AcademicSession';
import { StudentAttendance } from '../models/Attendance';
import { Campus } from '../models/Campus';
import { SchoolClass } from '../models/Academic';
import { Payroll } from '../models/Salary';
import { asyncHandler } from '../utils/asyncHandler';
import { instituteFilter } from '../utils/query';
import { parseCampusId } from '../utils/campusScope';
import { buildCampusDashboardRows } from '../services/dashboardCampusSummary';
import { ok } from '../utils/response';

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function eachDayKeys(days: number) {
  const keys: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    keys.push(dateKey(d));
  }
  return keys;
}

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

dashboardRouter.get(
  '/',
  requirePermission('dashboard.view'),
  asyncHandler(async (req, res) => {
    const filter = instituteFilter(req);
    const selectedCampusId = parseCampusId(req);
    const trendDays = 14;
    const dayKeys = eachDayKeys(trendDays);
    const from = dayKeys[0];
    const rangeStart = new Date(`${from}T00:00:00.000Z`);

    // Active session first — fee pending must match student profile year totals
    const activeSession = await AcademicSession.findOne({ ...filter, isActive: true });
    const sessionFeeFilter = activeSession ? { sessionId: activeSession._id } : {};

    const [
      studentDocs,
      staffDocs,
      openInvoicesRaw,
      allInvoicesRaw,
      eventsRaw,
      paymentsRaw,
      attendanceRowsRaw,
      campuses,
      payrollsRaw,
    ] = await Promise.all([
      Student.find({ ...filter, status: 'active', deletedAt: null }).select('_id campusId'),
      Staff.find({ ...filter, status: 'active', deletedAt: null }).select('_id campusId'),
      FeeInvoice.find({
        ...filter,
        ...sessionFeeFilter,
        status: { $in: ['issued', 'partial'] },
        deletedAt: null,
      }),
      FeeInvoice.find({
        ...filter,
        ...sessionFeeFilter,
        deletedAt: null,
      }).select('status totalAmount paidAmount studentId sessionId campusId'),
      Event.find({ ...filter, startAt: { $gte: new Date() }, deletedAt: null })
        .sort('startAt')
        .limit(8),
      FeePayment.find({
        ...filter,
        paidAt: { $gte: rangeStart },
        deletedAt: null,
      }),
      StudentAttendance.find({ ...filter, date: { $gte: from }, deletedAt: null }),
      Campus.find({ ...filter, deletedAt: null }).select('name code schoolCode isPrimary'),
      Payroll.find({ ...filter, deletedAt: null })
        .select('staffId month netPay status paidAt')
        .lean(),
    ]);

    const campusOfStudent = new Map(studentDocs.map((s) => [String(s._id), s.campusId ? String(s.campusId) : '']));
    const allowedStudents = selectedCampusId
      ? new Set(
          studentDocs.filter((s) => String(s.campusId || '') === selectedCampusId).map((s) => String(s._id))
        )
      : null;
    const allowedStaff = selectedCampusId
      ? new Set(staffDocs.filter((s) => String(s.campusId || '') === selectedCampusId).map((s) => String(s._id)))
      : null;

    const inStudentScope = (id: unknown) => !allowedStudents || allowedStudents.has(String(id));
    const inStaffScope = (id: unknown) => !allowedStaff || allowedStaff.has(String(id));

    const openInvoices = openInvoicesRaw.filter((i) => inStudentScope(i.studentId));
    const allInvoices = allInvoicesRaw.filter((i) => inStudentScope(i.studentId));
    const payments = paymentsRaw.filter((p) => inStudentScope(p.studentId));
    const attendanceRows = attendanceRowsRaw.filter((r) => inStudentScope(r.studentId));
    const events = eventsRaw.filter(
      (e) => !selectedCampusId || !e.campusId || String(e.campusId) === selectedCampusId
    );
    const payrolls = payrollsRaw.filter((p) => inStaffScope(p.staffId));
    const students = allowedStudents ? allowedStudents.size : studentDocs.length;
    const staff = allowedStaff ? allowedStaff.size : staffDocs.length;

    // Session-scoped received = sum of paidAmount on session invoices (same basis as student profile)
    const allPaymentsAgg = allInvoices
      .filter((i) => i.status !== 'cancelled' && i.status !== 'draft')
      .reduce((acc: { _id: string; received: number; paymentCount: number }[], inv) => {
        const sid = String(inv.studentId);
        let row = acc.find((r) => r._id === sid);
        if (!row) {
          row = { _id: sid, received: 0, paymentCount: 0 };
          acc.push(row);
        }
        row.received += inv.paidAmount || 0;
        if ((inv.paidAmount || 0) > 0) row.paymentCount += 1;
        return acc;
      }, []);

    const totalDue = openInvoices.reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
    const collectedPeriod = payments.reduce((s, p) => s + p.amount, 0);
    const totalReceived = allPaymentsAgg.reduce((s, r) => s + (r.received || 0), 0);
    const totalBilled = allInvoices
      .filter((i) => i.status !== 'cancelled' && i.status !== 'draft')
      .reduce((s, i) => s + i.totalAmount, 0);

    const presentish = attendanceRows.filter((r) =>
      ['present', 'late', 'half_day'].includes(r.status)
    ).length;
    const attendancePct = attendanceRows.length
      ? Math.round((presentish / attendanceRows.length) * 1000) / 10
      : 0;

    const byDay: Record<string, { present: number; total: number; absent: number; late: number }> = {};
    for (const key of dayKeys) {
      byDay[key] = { present: 0, total: 0, absent: 0, late: 0 };
    }
    for (const row of attendanceRows) {
      if (!byDay[row.date]) byDay[row.date] = { present: 0, total: 0, absent: 0, late: 0 };
      byDay[row.date].total += 1;
      if (['present', 'late', 'half_day'].includes(row.status)) byDay[row.date].present += 1;
      if (row.status === 'absent') byDay[row.date].absent += 1;
      if (row.status === 'late') byDay[row.date].late += 1;
    }
    const attendanceTrend = dayKeys.map((date) => ({
      date,
      percentage:
        byDay[date].total > 0
          ? Math.round((byDay[date].present / byDay[date].total) * 1000) / 10
          : 0,
      total: byDay[date].total,
      present: byDay[date].present,
      absent: byDay[date].absent,
      late: byDay[date].late,
    }));

    const collectionTrendMap: Record<string, number> = {};
    for (const key of dayKeys) collectionTrendMap[key] = 0;
    for (const p of payments) {
      const key = dateKey(new Date(p.paidAt));
      if (collectionTrendMap[key] === undefined) collectionTrendMap[key] = 0;
      collectionTrendMap[key] += p.amount;
    }
    const collectionTrend = dayKeys.map((date) => ({
      date,
      amount: money(collectionTrendMap[date] || 0),
    }));

    const feeStatusMap: Record<string, { count: number; amount: number }> = {
      issued: { count: 0, amount: 0 },
      partial: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      draft: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
    };
    for (const inv of allInvoices) {
      const key = inv.status || 'issued';
      if (!feeStatusMap[key]) feeStatusMap[key] = { count: 0, amount: 0 };
      feeStatusMap[key].count += 1;
      feeStatusMap[key].amount += Math.max(0, inv.totalAmount - inv.paidAmount);
    }
    const feeStatusBreakdown = Object.entries(feeStatusMap)
      .filter(([, v]) => v.count > 0)
      .map(([status, v]) => ({
        status,
        count: v.count,
        amount: money(v.amount),
      }));

    const attendanceStatusMap: Record<string, number> = {
      present: 0,
      absent: 0,
      late: 0,
      half_day: 0,
      excused: 0,
    };
    for (const row of attendanceRows) {
      const key = row.status || 'present';
      attendanceStatusMap[key] = (attendanceStatusMap[key] || 0) + 1;
    }
    const attendanceStatusBreakdown = Object.entries(attendanceStatusMap)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => ({ status, count }));

    const receivedByStudent = new Map<string, number>();
    for (const row of allPaymentsAgg) {
      receivedByStudent.set(String(row._id), row.received || 0);
    }

    const pendingByStudent = new Map<
      string,
      { pending: number; billed: number; paidOnInvoices: number; invoiceCount: number }
    >();
    for (const inv of allInvoices) {
      if (inv.status === 'cancelled' || inv.status === 'draft') continue;
      const sid = String(inv.studentId);
      const cur = pendingByStudent.get(sid) || {
        pending: 0,
        billed: 0,
        paidOnInvoices: 0,
        invoiceCount: 0,
      };
      cur.billed += inv.totalAmount;
      cur.paidOnInvoices += inv.paidAmount;
      // Same rule as student profile: pending = total - paid on issued/partial/paid invoices
      cur.pending += Math.max(0, inv.totalAmount - inv.paidAmount);
      cur.invoiceCount += 1;
      pendingByStudent.set(sid, cur);
    }

    const studentIdsForFees = [...new Set([...pendingByStudent.keys(), ...receivedByStudent.keys()])];
    const feeStudents = studentIdsForFees.length
      ? await Student.find({ _id: { $in: studentIdsForFees }, ...filter })
          .select('firstName lastName admissionNo status')
          .lean()
      : [];
    const studentInfo = new Map(feeStudents.map((s) => [String(s._id), s]));

    let enrollmentByStudent = new Map<
      string,
      { classId: string; className: string; sectionName?: string }
    >();
    let studentsByClass: { classId: string; className: string; count: number }[] = [];

    if (activeSession) {
      const enrollments = await Enrollment.find({
        ...filter,
        sessionId: activeSession._id,
        status: 'active',
      })
        .select('studentId classId sectionId')
        .populate('classId', 'name code')
        .populate('sectionId', 'name')
        .lean();

      enrollmentByStudent = new Map(
        enrollments.map((e) => {
          const cls = e.classId as { _id?: unknown; name?: string } | null;
          const sec = e.sectionId as { name?: string } | null;
          return [
            String(e.studentId),
            {
              classId: String(cls?._id || e.classId),
              className: cls?.name || 'Unknown',
              sectionName: sec?.name,
            },
          ];
        })
      );

      const classAgg = await Enrollment.aggregate([
        {
          $match: {
            instituteId: activeSession.instituteId,
            sessionId: activeSession._id,
            status: 'active',
            $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }],
          },
        },
        { $group: { _id: '$classId', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
      const classIds = classAgg.map((c) => c._id);
      const classes = await SchoolClass.find({ _id: { $in: classIds } }).select('name code');
      const classNameById = new Map(classes.map((c) => [String(c._id), c.name]));
      studentsByClass = classAgg.map((c) => ({
        classId: String(c._id),
        className: classNameById.get(String(c._id)) || 'Unknown',
        count: c.count,
      }));
    }

    const feesByStudent = studentIdsForFees
      .map((sid) => {
        const info = studentInfo.get(sid);
        const pend = pendingByStudent.get(sid);
        const enr = enrollmentByStudent.get(sid);
        return {
          studentId: sid,
          admissionNo: info?.admissionNo || '—',
          name: info ? `${info.firstName} ${info.lastName || ''}`.trim() : 'Unknown',
          classId: enr?.classId,
          className: enr?.className || 'Unassigned',
          sectionName: enr?.sectionName,
          pending: money(pend?.pending || 0),
          received: money(receivedByStudent.get(sid) || 0),
          billed: money(pend?.billed || 0),
          invoiceCount: pend?.invoiceCount || 0,
        };
      })
      .filter((r) => r.pending > 0 || r.received > 0)
      .sort((a, b) => b.pending - a.pending || b.received - a.received);

    const classMap = new Map<
      string,
      {
        classId: string;
        className: string;
        pending: number;
        received: number;
        billed: number;
        studentCount: number;
        invoiceCount: number;
      }
    >();
    for (const row of feesByStudent) {
      const key = row.classId || 'unassigned';
      const cur = classMap.get(key) || {
        classId: key,
        className: row.className || 'Unassigned',
        pending: 0,
        received: 0,
        billed: 0,
        studentCount: 0,
        invoiceCount: 0,
      };
      cur.pending += row.pending;
      cur.received += row.received;
      cur.billed += row.billed;
      cur.studentCount += 1;
      cur.invoiceCount += row.invoiceCount;
      classMap.set(key, cur);
    }
    const feesByClass = [...classMap.values()]
      .map((c) => ({
        ...c,
        pending: money(c.pending),
        received: money(c.received),
        billed: money(c.billed),
      }))
      .sort((a, b) => b.pending - a.pending);

    const staffIds = [...new Set(payrolls.map((p) => String(p.staffId)))];
    const payrollStaffDocs = staffIds.length
      ? await Staff.find({ _id: { $in: staffIds }, ...filter })
          .select('firstName lastName employeeCode designation status')
          .lean()
      : [];
    const staffInfo = new Map(payrollStaffDocs.map((s) => [String(s._id), s]));

    let salaryPending = 0;
    let salaryPaid = 0;
    const salaryByStaffMap = new Map<
      string,
      { pending: number; paid: number; pendingCount: number; paidCount: number }
    >();
    const salaryByMonthMap = new Map<string, { pending: number; paid: number }>();

    for (const p of payrolls) {
      const sid = String(p.staffId);
      const cur = salaryByStaffMap.get(sid) || {
        pending: 0,
        paid: 0,
        pendingCount: 0,
        paidCount: 0,
      };
      const monthCur = salaryByMonthMap.get(p.month) || { pending: 0, paid: 0 };
      if (p.status === 'paid') {
        salaryPaid += p.netPay;
        cur.paid += p.netPay;
        cur.paidCount += 1;
        monthCur.paid += p.netPay;
      } else {
        salaryPending += p.netPay;
        cur.pending += p.netPay;
        cur.pendingCount += 1;
        monthCur.pending += p.netPay;
      }
      salaryByStaffMap.set(sid, cur);
      salaryByMonthMap.set(p.month, monthCur);
    }

    const salaryByStaff = [...salaryByStaffMap.entries()]
      .map(([sid, vals]) => {
        const info = staffInfo.get(sid);
        return {
          staffId: sid,
          employeeCode: info?.employeeCode || '—',
          name: info ? `${info.firstName} ${info.lastName || ''}`.trim() : 'Unknown',
          designation: info?.designation || '—',
          pending: money(vals.pending),
          paid: money(vals.paid),
          pendingCount: vals.pendingCount,
          paidCount: vals.paidCount,
        };
      })
      .sort((a, b) => b.pending - a.pending || b.paid - a.paid);

    const salaryByMonth = [...salaryByMonthMap.entries()]
      .map(([month, vals]) => ({
        month,
        pending: money(vals.pending),
        paid: money(vals.paid),
        total: money(vals.pending + vals.paid),
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    const last7 = dayKeys.slice(-7);
    const collected7d = collectionTrend
      .filter((r) => last7.includes(r.date))
      .reduce((s, r) => s + r.amount, 0);
    const att7 = attendanceRows.filter((r) => last7.includes(r.date));
    const present7 = att7.filter((r) => ['present', 'late', 'half_day'].includes(r.status)).length;
    const attendancePct7 = att7.length ? Math.round((present7 / att7.length) * 1000) / 10 : 0;

    const byCampus = buildCampusDashboardRows({
      campuses,
      studentDocs,
      staffDocs,
      invoices: allInvoicesRaw,
      attendanceRows: attendanceRowsRaw,
      campusOfStudent,
      money,
    });

    return ok(res, {
      counts: {
        students,
        staff,
        openInvoices: openInvoices.length,
        upcomingEvents: events.length,
      },
      totalDue: money(totalDue),
      collected7d: money(collected7d),
      collectedPeriod: money(collectedPeriod),
      attendancePct: attendancePct7,
      attendancePctPeriod: attendancePct,
      campusCount: campuses.length,
      selectedCampusId: selectedCampusId || null,
      byCampus,
      trendDays,
      activeSession,
      upcomingEvents: events,
      attendanceTrend,
      collectionTrend,
      feeStatusBreakdown,
      attendanceStatusBreakdown,
      studentsByClass,
      fees: {
        sessionId: activeSession ? String(activeSession._id) : null,
        sessionName: activeSession?.name || null,
        pending: money(totalDue),
        received: money(totalReceived),
        billed: money(totalBilled),
        openInvoiceCount: openInvoices.length,
        studentCount: feesByStudent.filter((s) => s.pending > 0).length,
        byClass: feesByClass,
        byStudent: feesByStudent.slice(0, 200),
      },
      salary: {
        pending: money(salaryPending),
        paid: money(salaryPaid),
        payrollCount: payrolls.length,
        pendingCount: payrolls.filter((p) => p.status !== 'paid').length,
        paidCount: payrolls.filter((p) => p.status === 'paid').length,
        staffCount: salaryByStaff.length,
        byStaff: salaryByStaff,
        byMonth: salaryByMonth,
      },
    });
  })
);
