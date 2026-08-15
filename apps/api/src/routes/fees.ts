import { FEE_APPLICABILITIES, FEE_CATEGORIES } from '@anyit/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { FeeHead, FeeInvoice, FeePayment, FeeStructure } from '../models/Fee';
import { Student, Enrollment } from '../models/Student';
import { AcademicSession } from '../models/AcademicSession';
import { Institute } from '../models/Institute';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter, parsePagination } from '../utils/query';
import { ok, paginationMeta } from '../utils/response';
import { streamFeeReceiptPdf } from '../services/receiptPdf';
import {
  indianFinancialYear,
  streamItrFeeStatementPdf,
  streamMonthFeeReceiptPdf,
} from '../services/feeStatementsPdf';
import { notify } from '../services/notifications';

const feeCategorySchema = z.enum(FEE_CATEGORIES);
const feeApplicabilitySchema = z.enum(FEE_APPLICABILITIES);
function seq(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

/** One user payment action → one batch (may allocate across several invoices). */
function newPaymentBatchId() {
  return seq('RCP');
}

export const feesRouter = Router();
feesRouter.use(authenticate);

feesRouter.get(
  '/heads',
  requirePermission('fees.view', 'fees.manage'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const applicability =
      typeof req.query.applicability === 'string' ? req.query.applicability : undefined;
    const filter: Record<string, unknown> = { ...instituteFilter(req) };
    if (applicability) filter.applicability = applicability;
    let items = await FeeHead.find(filter).populate('classIds', 'name code').sort('name').lean();
    if (classId) {
      items = items.filter(
        (h) =>
          h.applicability !== 'class' ||
          (h.classIds || []).some((c) => String((c as { _id?: unknown })?._id || c) === classId)
      );
    }
    return ok(res, items);
  })
);

feesRouter.post(
  '/heads',
  requirePermission('fees.manage'),
  audit('fee_head', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        category: feeCategorySchema.optional(),
        applicability: feeApplicabilitySchema.optional(),
        classIds: z.array(z.string()).optional(),
        defaultAmount: z.number().nonnegative().optional(),
        isOptional: z.boolean().optional(),
      })
      .parse(req.body);
    const applicability = body.applicability ?? (body.category === 'transport' ? 'transport' : 'class');
    if (applicability === 'class' && !(body.classIds || []).length) {
      throw new AppError(400, 'CLASS_REQUIRED', 'Select at least one class for this fee category');
    }
    const item = await FeeHead.create({
      name: body.name,
      code: body.code.toUpperCase(),
      category: body.category ?? 'other',
      applicability,
      classIds: body.classIds ?? [],
      defaultAmount: body.defaultAmount ?? 0,
      isOptional: body.isOptional ?? applicability !== 'class',
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

feesRouter.patch(
  '/heads/:id',
  requirePermission('fees.manage'),
  audit('fee_head', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        category: feeCategorySchema.optional(),
        applicability: feeApplicabilitySchema.optional(),
        classIds: z.array(z.string()).optional(),
        defaultAmount: z.number().nonnegative().optional(),
        isOptional: z.boolean().optional(),
      })
      .parse(req.body);
    const item = await FeeHead.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    ).populate('classIds', 'name code');
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Fee head not found');
    return ok(res, item);
  })
);

feesRouter.get(
  '/categories',
  requirePermission('fees.view', 'fees.manage'),
  asyncHandler(async (_req, res) => ok(res, FEE_CATEGORIES))
);

feesRouter.get(
  '/structures',
  requirePermission('fees.view', 'fees.manage'),
  asyncHandler(async (req, res) => {
    const items = await FeeStructure.find(instituteFilter(req))
      .populate('classId', 'name')
      .populate('sessionId', 'name')
      .populate('items.feeHeadId', 'name code');
    return ok(res, items);
  })
);

feesRouter.post(
  '/structures',
  requirePermission('fees.manage'),
  audit('fee_structure', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        sessionId: z.string(),
        classId: z.string(),
        name: z.string(),
        items: z.array(z.object({ feeHeadId: z.string(), amount: z.number().nonnegative() })),
        lateFeePerDay: z.number().optional(),
      })
      .parse(req.body);
    const item = await FeeStructure.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

feesRouter.get(
  '/invoices',
  requirePermission('fees.view'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req);
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const filter = {
      ...instituteFilter(req),
      ...(studentId ? { studentId } : {}),
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      FeeInvoice.find(filter)
        .populate('studentId', 'firstName lastName admissionNo')
        .skip(skip)
        .limit(limit)
        .sort('-createdAt'),
      FeeInvoice.countDocuments(filter),
    ]);
    return ok(res, items, paginationMeta(page, limit, total));
  })
);

feesRouter.get(
  '/dues',
  requirePermission('fees.view'),
  asyncHandler(async (req, res) => {
    const items = await FeeInvoice.find({
      ...instituteFilter(req),
      status: { $in: ['issued', 'partial'] },
    })
      .populate('studentId', 'firstName lastName admissionNo')
      .sort('-dueDate')
      .limit(200);
    const totalDue = items.reduce((sum, i) => sum + (i.totalAmount - i.paidAmount), 0);
    return ok(res, { items, totalDue });
  })
);

/**
 * Pending fee report — filter by month (YYYY-MM) and/or class.
 * Month matches invoice dueDate when set, otherwise createdAt.
 */
feesRouter.get(
  '/pending-report',
  requirePermission('fees.view'),
  asyncHandler(async (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const month = typeof req.query.month === 'string' ? req.query.month : undefined; // YYYY-MM
    const { page, limit, skip } = parsePagination(req);

    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'INVALID_MONTH', 'month must be YYYY-MM');
    }

    let studentIds: string[] | undefined;
    const enrollmentByStudent = new Map<
      string,
      { classId: string; className: string; sectionName: string; sessionName: string }
    >();

    const enrollFilter: Record<string, unknown> = {
      ...instituteFilter(req),
      status: 'active',
      ...(sessionId ? { sessionId } : {}),
      ...(classId ? { classId } : {}),
    };

    const enrollments = await Enrollment.find(enrollFilter)
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .populate('sessionId', 'name')
      .lean();

    for (const e of enrollments) {
      const sid = String(e.studentId);
      const cls = e.classId as { _id?: unknown; name?: string } | null;
      const sec = e.sectionId as { name?: string } | null;
      const sess = e.sessionId as { name?: string } | null;
      enrollmentByStudent.set(sid, {
        classId: String(cls?._id || e.classId),
        className: cls?.name || 'Unknown',
        sectionName: sec?.name || '—',
        sessionName: sess?.name || '—',
      });
    }

    if (classId || sessionId) {
      studentIds = Array.from(enrollmentByStudent.keys());
      if (!studentIds.length) {
        return ok(
          res,
          {
            rows: [],
            summary: { totalDue: 0, invoiceCount: 0, studentCount: 0 },
            byClass: [],
            byMonth: [],
          },
          paginationMeta(page, limit, 0)
        );
      }
    }

    const invoiceFilter: Record<string, unknown> = {
      ...instituteFilter(req),
      status: { $in: ['issued', 'partial'] },
      ...(sessionId ? { sessionId } : {}),
      ...(studentIds ? { studentId: { $in: studentIds } } : {}),
    };

    if (month) {
      const [y, m] = month.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      invoiceFilter.$or = [
        { billingMonth: month },
        { dueDate: { $gte: start, $lt: end } },
        {
          $and: [
            { billingMonth: { $in: [null, ''] } },
            { $or: [{ dueDate: null }, { dueDate: { $exists: false } }] },
            { createdAt: { $gte: start, $lt: end } },
          ],
        },
      ];
    }

    const invoices = await FeeInvoice.find(invoiceFilter)
      .populate('studentId', 'firstName lastName admissionNo phone')
      .populate('sessionId', 'name')
      .sort('-dueDate -createdAt')
      .lean();

    // Attach class info (prefer enrollment; if missing and no class filter, still include)
    type Row = {
      invoiceId: unknown;
      invoiceNo: string;
      dueDate?: Date;
      createdAt?: Date;
      monthKey: string;
      totalAmount: number;
      paidAmount: number;
      pendingAmount: number;
      status: string;
      studentId: unknown;
      admissionNo?: string;
      studentName: string;
      phone?: string;
      classId?: string;
      className: string;
      sectionName: string;
      sessionName: string;
    };

    const rows: Row[] = [];
    for (const inv of invoices) {
      const stu = inv.studentId as {
        _id?: unknown;
        firstName?: string;
        lastName?: string;
        admissionNo?: string;
        phone?: string;
      } | null;
      if (!stu) continue;
      const sid = String(stu._id);
      const enr = enrollmentByStudent.get(sid);
      if ((classId || sessionId) && !enr) continue;

      const due = (inv as { billingMonth?: string }).billingMonth
        ? new Date(`${(inv as { billingMonth?: string }).billingMonth}-01T00:00:00Z`)
        : inv.dueDate || (inv as { createdAt?: Date }).createdAt;
      const monthKey =
        (inv as { billingMonth?: string }).billingMonth ||
        (due
          ? `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}`
          : 'unknown');

      const sess = inv.sessionId as { name?: string } | null;
      rows.push({
        invoiceId: inv._id,
        invoiceNo: inv.invoiceNo,
        dueDate: inv.dueDate,
        createdAt: (inv as { createdAt?: Date }).createdAt,
        monthKey,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        pendingAmount: inv.totalAmount - inv.paidAmount,
        status: inv.status,
        studentId: stu._id,
        admissionNo: stu.admissionNo,
        studentName: `${stu.firstName || ''} ${stu.lastName || ''}`.trim(),
        phone: stu.phone,
        classId: enr?.classId,
        className: enr?.className || 'Unassigned',
        sectionName: enr?.sectionName || '—',
        sessionName: enr?.sessionName || sess?.name || '—',
      });
    }

    const totalDue = rows.reduce((s, r) => s + r.pendingAmount, 0);
    const studentSet = new Set(rows.map((r) => String(r.studentId)));

    const byClassMap = new Map<string, { classId: string; className: string; pendingAmount: number; invoiceCount: number; studentIds: Set<string> }>();
    const byMonthMap = new Map<string, { month: string; pendingAmount: number; invoiceCount: number; studentIds: Set<string> }>();

    for (const r of rows) {
      const cKey = r.classId || r.className;
      if (!byClassMap.has(cKey)) {
        byClassMap.set(cKey, {
          classId: r.classId || '',
          className: r.className,
          pendingAmount: 0,
          invoiceCount: 0,
          studentIds: new Set(),
        });
      }
      const c = byClassMap.get(cKey)!;
      c.pendingAmount += r.pendingAmount;
      c.invoiceCount += 1;
      c.studentIds.add(String(r.studentId));

      if (!byMonthMap.has(r.monthKey)) {
        byMonthMap.set(r.monthKey, {
          month: r.monthKey,
          pendingAmount: 0,
          invoiceCount: 0,
          studentIds: new Set(),
        });
      }
      const m = byMonthMap.get(r.monthKey)!;
      m.pendingAmount += r.pendingAmount;
      m.invoiceCount += 1;
      m.studentIds.add(String(r.studentId));
    }

    const byClass = Array.from(byClassMap.values())
      .map((c) => ({
        classId: c.classId,
        className: c.className,
        pendingAmount: Math.round(c.pendingAmount * 100) / 100,
        invoiceCount: c.invoiceCount,
        studentCount: c.studentIds.size,
      }))
      .sort((a, b) => b.pendingAmount - a.pendingAmount);

    const byMonth = Array.from(byMonthMap.values())
      .map((m) => ({
        month: m.month,
        pendingAmount: Math.round(m.pendingAmount * 100) / 100,
        invoiceCount: m.invoiceCount,
        studentCount: m.studentIds.size,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const total = rows.length;
    const pageRows = rows.slice(skip, skip + limit);

    return ok(
      res,
      {
        rows: pageRows,
        summary: {
          totalDue: Math.round(totalDue * 100) / 100,
          invoiceCount: rows.length,
          studentCount: studentSet.size,
        },
        byClass,
        byMonth,
      },
      paginationMeta(page, limit, total)
    );
  })
);

/** Per-student pending fee ledger — months pending + category breakdown */
feesRouter.get(
  '/students/:studentId/pending-detail',
  requirePermission('fees.view'),
  asyncHandler(async (req, res) => {
    const studentId = req.params.studentId;
    const student = await Student.findOne({ _id: studentId, ...instituteFilter(req) });
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

    const enrollment = await Enrollment.findOne({
      ...instituteFilter(req),
      studentId,
      status: 'active',
    })
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .populate('sessionId', 'name')
      .sort('-createdAt');

    const activeSession = await AcademicSession.findOne({
      ...instituteFilter(req),
      isActive: true,
    }).select('_id name');
    const activeSessionId = activeSession?._id;

    const invoices = await FeeInvoice.find({
      ...instituteFilter(req),
      studentId,
      status: { $in: ['issued', 'partial', 'paid'] },
      deletedAt: null,
      ...(activeSessionId ? { sessionId: activeSessionId } : {}),
    })
      .sort('billingMonth dueDate createdAt')
      .lean();

    const payments = await FeePayment.find({
      ...instituteFilter(req),
      studentId,
    })
      .sort('-paidAt')
      .lean();

    type LinePending = {
      name: string;
      category: string;
      amount: number;
      pendingAmount: number;
      billingMonth?: string;
    };

    type InvoiceDetail = {
      invoiceId: unknown;
      invoiceNo: string;
      billingMonth: string;
      status: string;
      totalAmount: number;
      paidAmount: number;
      pendingAmount: number;
      dueDate?: Date;
      items: LinePending[];
    };

    const invoiceDetails: InvoiceDetail[] = [];
    const byMonthMap = new Map<
      string,
      {
        month: string;
        pendingAmount: number;
        totalAmount: number;
        paidAmount: number;
        invoiceCount: number;
        byCategory: Record<string, number>;
        lines: LinePending[];
      }
    >();
    const byCategoryMap = new Map<string, { category: string; pendingAmount: number; totalAmount: number }>();

    for (const inv of invoices) {
      const pending = Math.max(0, inv.totalAmount - inv.paidAmount);
      const ratio = inv.totalAmount > 0 ? pending / inv.totalAmount : 0;
      const month =
        inv.billingMonth ||
        (inv.dueDate
          ? `${inv.dueDate.getUTCFullYear()}-${String(inv.dueDate.getUTCMonth() + 1).padStart(2, '0')}`
          : inv.createdAt
            ? `${inv.createdAt.getUTCFullYear()}-${String(inv.createdAt.getUTCMonth() + 1).padStart(2, '0')}`
            : 'unknown');

      const items: LinePending[] = (inv.items || []).map((it) => {
        const cat = it.category || 'other';
        const linePending = Math.round(it.amount * ratio * 100) / 100;
        return {
          name: it.name,
          category: cat,
          amount: it.amount,
          pendingAmount: linePending,
          billingMonth: it.billingMonth || month,
        };
      });

      // If no items, treat whole invoice as other
      if (!items.length && inv.totalAmount) {
        items.push({
          name: 'Fee charges',
          category: 'other',
          amount: inv.totalAmount,
          pendingAmount: pending,
          billingMonth: month,
        });
      }

      invoiceDetails.push({
        invoiceId: inv._id,
        invoiceNo: inv.invoiceNo,
        billingMonth: month,
        status: inv.status,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        pendingAmount: pending,
        dueDate: inv.dueDate,
        items,
      });

      if (!byMonthMap.has(month)) {
        byMonthMap.set(month, {
          month,
          pendingAmount: 0,
          totalAmount: 0,
          paidAmount: 0,
          invoiceCount: 0,
          byCategory: {},
          lines: [],
        });
      }
      const m = byMonthMap.get(month)!;
      m.pendingAmount += pending;
      m.totalAmount += inv.totalAmount;
      m.paidAmount += inv.paidAmount;
      m.invoiceCount += 1;

      for (const line of items) {
        if (line.pendingAmount <= 0) continue;
        m.byCategory[line.category] = (m.byCategory[line.category] || 0) + line.pendingAmount;
        m.lines.push(line);
        if (!byCategoryMap.has(line.category)) {
          byCategoryMap.set(line.category, {
            category: line.category,
            pendingAmount: 0,
            totalAmount: 0,
          });
        }
        const c = byCategoryMap.get(line.category)!;
        c.pendingAmount += line.pendingAmount;
        c.totalAmount += line.amount;
      }
    }

    const pendingInvoices = invoiceDetails.filter((i) => i.pendingAmount > 0);
    const monthsPending = Array.from(byMonthMap.values())
      .filter((m) => m.pendingAmount > 0)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        pendingAmount: Math.round(m.pendingAmount * 100) / 100,
        totalAmount: Math.round(m.totalAmount * 100) / 100,
        paidAmount: Math.round(m.paidAmount * 100) / 100,
        byCategory: Object.fromEntries(
          Object.entries(m.byCategory).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
      }));

    const byCategory = Array.from(byCategoryMap.values())
      .map((c) => ({
        ...c,
        pendingAmount: Math.round(c.pendingAmount * 100) / 100,
        totalAmount: Math.round(c.totalAmount * 100) / 100,
      }))
      .sort((a, b) => b.pendingAmount - a.pendingAmount);

    // Must match sum of month-wise pending (same basis as student profile card)
    const totalPending = Math.round(monthsPending.reduce((s, m) => s + m.pendingAmount, 0) * 100) / 100;
    const totalPaid = invoiceDetails.reduce((s, i) => s + i.paidAmount, 0);
    const totalBilled = invoiceDetails.reduce((s, i) => s + i.totalAmount, 0);

    const cls = enrollment?.classId as { name?: string } | undefined;
    const sec = enrollment?.sectionId as { name?: string } | undefined;
    const sess = enrollment?.sessionId as { name?: string } | undefined;

    return ok(res, {
      student: {
        id: student._id,
        admissionNo: student.admissionNo,
        name: `${student.firstName} ${student.lastName || ''}`.trim(),
        phone: student.phone,
        email: student.email,
        className: cls?.name,
        sectionName: sec?.name,
        sessionName: sess?.name,
      },
      summary: {
        totalBilled: Math.round(totalBilled * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        totalPending: Math.round(totalPending * 100) / 100,
        monthsPendingCount: monthsPending.length,
        openInvoiceCount: pendingInvoices.length,
        paymentCount: payments.length,
      },
      monthsPending,
      byCategory,
      invoices: invoiceDetails,
      payments: payments.map((p) => ({
        id: p._id,
        receiptNo: p.receiptNo,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt,
        invoiceId: p.invoiceId,
      })),
    });
  })
);

feesRouter.post(
  '/invoices',
  requirePermission('fees.manage', 'fees.collect'),
  audit('fee_invoice', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        studentId: z.string(),
        /** Simplified create: amount + description (preferred) */
        amount: z.number().positive().optional(),
        description: z.string().min(1).optional(),
        sessionId: z.string().optional(),
        structureId: z.string().optional(),
        billingMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        dueDate: z.string().optional(),
        items: z
          .array(
            z.object({
              name: z.string(),
              amount: z.number(),
              category: feeCategorySchema.optional(),
              feeHeadId: z.string().optional(),
              billingMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
              description: z.string().optional(),
            })
          )
          .optional(),
        discount: z.number().optional(),
        lateFee: z.number().optional(),
        paymentStatus: z.enum(['pending', 'paid']).optional(),
        paymentMethod: z.enum(['cash', 'upi', 'card', 'bank', 'other']).optional(),
        source: z.string().optional(),
      })
      .parse(req.body);

    let sessionId = body.sessionId;
    if (!sessionId) {
      const active = await AcademicSession.findOne({ ...instituteFilter(req), isActive: true });
      if (!active) throw new AppError(400, 'NO_SESSION', 'No active academic session');
      sessionId = String(active._id);
    }

    const now = new Date();
    const billingMonth =
      body.billingMonth ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let items = body.items?.filter((i) => i.name && i.amount > 0) || [];
    if ((!items.length || body.amount) && body.amount && body.description?.trim()) {
      items = [
        {
          name: body.description.trim(),
          amount: body.amount,
          category: 'other' as const,
          description: body.description.trim(),
          billingMonth,
        },
      ];
    }
    if (!items.length) {
      throw new AppError(400, 'VALIDATION', 'Provide amount and description');
    }

    const discount = body.discount ?? 0;
    const lateFee = body.lateFee ?? 0;
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const totalAmount = Math.max(0, subtotal - discount + lateFee);
    const markPaid = body.paymentStatus === 'paid';
    const method = body.paymentMethod || 'cash';
    const note = body.description?.trim();

    /**
     * Save as Paid → apply cash to existing open month invoices (oldest first).
     * Only create a new paid invoice if nothing was due, or amount exceeds dues.
     */
    if (markPaid && totalAmount > 0) {
      const openInvoices = await FeeInvoice.find({
        ...instituteFilter(req),
        studentId: body.studentId,
        sessionId,
        status: { $in: ['issued', 'partial'] },
        deletedAt: null,
      }).sort({ billingMonth: 1, createdAt: 1 });

      let remaining = Math.round(totalAmount * 100) / 100;
      const payments = [];
      const settled = [];
      const paymentBatchId = newPaymentBatchId();
      let allocIndex = 0;

      for (const inv of openInvoices) {
        if (remaining <= 0) break;
        const due = Math.round(Math.max(0, inv.totalAmount - inv.paidAmount) * 100) / 100;
        if (due <= 0) continue;
        const payAmt = Math.min(remaining, due);
        allocIndex += 1;
        const payment = await FeePayment.create({
          invoiceId: inv._id,
          studentId: body.studentId,
          amount: payAmt,
          method,
          reference: note,
          paidAt: now,
          // Shared batch id = public receipt; unique receiptNo per allocation row
          paymentBatchId,
          receiptNo: allocIndex === 1 ? paymentBatchId : `${paymentBatchId}-${allocIndex}`,
          instituteId: req.user!.instituteId,
          ...actorFields(req, true),
        });
        inv.paidAmount = Math.round((inv.paidAmount + payAmt) * 100) / 100;
        inv.status = inv.paidAmount >= inv.totalAmount - 0.001 ? 'paid' : 'partial';
        if (inv.status === 'paid') inv.paidAmount = inv.totalAmount;
        Object.assign(inv, actorFields(req));
        await inv.save();
        payments.push(payment);
        settled.push(inv);
        remaining = Math.round((remaining - payAmt) * 100) / 100;
      }

      let extraInvoice = null;
      let extraPayment = null;
      let advanceAmount = 0;
      if (remaining > 0) {
        // No open dues (or leftover after clearing) → record as advance credit
        advanceAmount = remaining;
        extraInvoice = await FeeInvoice.create({
          studentId: body.studentId,
          sessionId,
          structureId: body.structureId,
          billingMonth,
          dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
          items: [
            {
              name: 'Advance fee payment',
              amount: remaining,
              category: 'other' as const,
              description: note || 'Advance payment (no pending dues)',
              billingMonth,
            },
          ],
          discount: 0,
          lateFee: 0,
          totalAmount: remaining,
          paidAmount: remaining,
          invoiceNo: seq('INV'),
          status: 'paid',
          source: 'advance',
          instituteId: req.user!.instituteId,
          ...actorFields(req, true),
        });
        allocIndex += 1;
        extraPayment = await FeePayment.create({
          invoiceId: extraInvoice._id,
          studentId: body.studentId,
          amount: remaining,
          method,
          reference: note || 'Advance payment',
          paidAt: now,
          paymentBatchId,
          receiptNo: allocIndex === 1 ? paymentBatchId : `${paymentBatchId}-${allocIndex}`,
          instituteId: req.user!.instituteId,
          ...actorFields(req, true),
        });
        payments.push(extraPayment);
      }

      const primaryPayment = payments[0] || extraPayment;
      const batchAmount = Math.round(payments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
      return ok(
        res,
        {
          mode: 'settle',
          settledCount: settled.length,
          settledAmount: Math.round((totalAmount - remaining) * 100) / 100,
          advanceAmount,
          invoice: extraInvoice || settled[settled.length - 1] || null,
          payment: primaryPayment
            ? {
                ...primaryPayment.toObject(),
                amount: batchAmount,
                receiptNo: paymentBatchId,
                paymentBatchId,
              }
            : null,
          payments,
          paymentBatchId,
          settledInvoices: settled.map((i) => ({
            _id: i._id,
            invoiceNo: i.invoiceNo,
            billingMonth: i.billingMonth,
            status: i.status,
            paidAmount: i.paidAmount,
            totalAmount: i.totalAmount,
          })),
        },
        undefined,
        201
      );
    }

    // Save as Pending → create a new open invoice
    const item = await FeeInvoice.create({
      studentId: body.studentId,
      sessionId,
      structureId: body.structureId,
      billingMonth,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      items,
      discount,
      lateFee,
      totalAmount,
      paidAmount: 0,
      invoiceNo: seq('INV'),
      status: 'issued',
      source: body.source || 'manual',
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, { mode: 'create', invoice: item, payment: null }, undefined, 201);
  })
);

/** Other fee (one-off) for a single student — Paid or Pending */
feesRouter.post(
  '/students/:studentId/charges',
  requirePermission('fees.manage', 'fees.collect'),
  audit('fee_invoice', 'adhoc_charge'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1),
        amount: z.number().positive(),
        description: z.string().optional(),
        paymentStatus: z.enum(['pending', 'paid']),
        paymentMethod: z.enum(['cash', 'upi', 'card', 'bank', 'other']).optional(),
        sessionId: z.string().optional(),
        billingMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        feeHeadId: z.string().optional(),
      })
      .parse(req.body);

    const student = await Student.findOne({
      _id: req.params.studentId,
      ...instituteFilter(req),
    });
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

    let sessionId = body.sessionId;
    if (!sessionId) {
      const active = await AcademicSession.findOne({ ...instituteFilter(req), isActive: true });
      if (!active) throw new AppError(400, 'NO_SESSION', 'No active academic session');
      sessionId = String(active._id);
    }

    const markPaid = body.paymentStatus === 'paid';
    const now = new Date();
    const billingMonth =
      body.billingMonth ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const description = body.description?.trim() || undefined;

    const invoice = await FeeInvoice.create({
      studentId: student._id,
      sessionId,
      billingMonth,
      items: [
        {
          name: body.title.trim(),
          amount: body.amount,
          category: 'other',
          description,
          feeHeadId: body.feeHeadId,
          billingMonth,
        },
      ],
      discount: 0,
      lateFee: 0,
      totalAmount: body.amount,
      paidAmount: markPaid ? body.amount : 0,
      invoiceNo: seq('INV'),
      status: markPaid ? 'paid' : 'issued',
      source: 'adhoc',
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });

    if (markPaid) {
      const paymentBatchId = newPaymentBatchId();
      await FeePayment.create({
        invoiceId: invoice._id,
        studentId: student._id,
        amount: body.amount,
        method: body.paymentMethod || 'cash',
        paidAt: now,
        receiptNo: paymentBatchId,
        paymentBatchId,
        instituteId: req.user!.instituteId,
        ...actorFields(req, true),
      });
    }

    return ok(
      res,
      {
        invoice,
        message: markPaid
          ? 'Other fee recorded as paid'
          : 'Other fee added as pending — included in fee dues',
      },
      undefined,
      201
    );
  })
);

/** Update an other-fee (adhoc) invoice — title, amount, month, pending/paid */
feesRouter.patch(
  '/students/:studentId/charges/:invoiceId',
  requirePermission('fees.manage', 'fees.collect'),
  audit('fee_invoice', 'adhoc_charge_update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1).optional(),
        amount: z.number().positive().optional(),
        description: z.string().optional(),
        billingMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        paymentStatus: z.enum(['pending', 'paid']).optional(),
        paymentMethod: z.enum(['cash', 'upi', 'card', 'bank', 'other']).optional(),
      })
      .parse(req.body);

    const invoice = await FeeInvoice.findOne({
      _id: req.params.invoiceId,
      studentId: req.params.studentId,
      source: 'adhoc',
      ...instituteFilter(req),
    });
    if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Other fee not found');

    const first = invoice.items[0] || { name: '', amount: 0, category: 'other' as const };
    const title = body.title?.trim() ?? first.name;
    const amount = body.amount ?? first.amount;
    const description =
      body.description !== undefined ? body.description.trim() || undefined : first.description;
    const billingMonth = body.billingMonth ?? invoice.billingMonth;

    invoice.items = [
      {
        name: title,
        amount,
        category: 'other',
        description,
        categoryLabel: first.categoryLabel,
        feeHeadId: first.feeHeadId,
        billingMonth,
      },
    ];
    invoice.totalAmount = amount;
    invoice.billingMonth = billingMonth;

    if (body.paymentStatus === 'paid') {
      const alreadyPaid = invoice.paidAmount >= amount && invoice.status === 'paid';
      if (!alreadyPaid) {
        const due = Math.max(0, amount - invoice.paidAmount);
        if (due > 0) {
          const paymentBatchId = newPaymentBatchId();
          await FeePayment.create({
            invoiceId: invoice._id,
            studentId: invoice.studentId,
            amount: due,
            method: body.paymentMethod || 'cash',
            paidAt: new Date(),
            receiptNo: paymentBatchId,
            paymentBatchId,
            instituteId: req.user!.instituteId,
            ...actorFields(req, true),
          });
        }
        invoice.paidAmount = amount;
        invoice.status = 'paid';
      } else {
        invoice.paidAmount = amount;
        invoice.status = 'paid';
      }
    } else if (body.paymentStatus === 'pending') {
      // Keep existing payments but if fully paid and user sets pending, leave paidAmount as-is
      // unless they want to reopen — reopen unpaid portion only when was issued/partial
      if (invoice.status === 'paid' && invoice.paidAmount >= amount) {
        // stay paid if already fully paid; only update details
        invoice.paidAmount = amount;
        invoice.status = 'paid';
      } else {
        invoice.status = invoice.paidAmount > 0 ? 'partial' : 'issued';
        if (invoice.paidAmount > amount) invoice.paidAmount = amount;
      }
    } else {
      // amount change without status change
      if (invoice.status === 'paid') {
        invoice.paidAmount = amount;
      } else if (invoice.paidAmount >= amount && amount > 0) {
        invoice.status = 'paid';
        invoice.paidAmount = amount;
      } else if (invoice.paidAmount > 0) {
        invoice.status = 'partial';
      }
    }

    Object.assign(invoice, actorFields(req));
    await invoice.save();
    return ok(res, invoice);
  })
);

/** Soft-delete an other-fee entry (and its payments) */
feesRouter.delete(
  '/students/:studentId/charges/:invoiceId',
  requirePermission('fees.manage'),
  audit('fee_invoice', 'adhoc_charge_delete'),
  asyncHandler(async (req, res) => {
    const invoice = await FeeInvoice.findOne({
      _id: req.params.invoiceId,
      studentId: req.params.studentId,
      source: 'adhoc',
      ...instituteFilter(req),
    });
    if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Other fee not found');

    const now = new Date();
    invoice.deletedAt = now;
    invoice.status = 'cancelled';
    Object.assign(invoice, actorFields(req));
    await invoice.save();

    await FeePayment.updateMany(
      {
        invoiceId: invoice._id,
        studentId: invoice.studentId,
        deletedAt: null,
        instituteId: req.user!.instituteId,
      },
      { $set: { deletedAt: now, ...actorFields(req) } }
    );

    return ok(res, { deleted: true, invoiceId: invoice._id });
  })
);

feesRouter.post(
  '/payments',
  requirePermission('fees.collect'),
  audit('fee_payment', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        invoiceId: z.string(),
        amount: z.number().positive(),
        method: z.enum(['cash', 'upi', 'card', 'bank', 'other']).optional(),
        reference: z.string().optional(),
      })
      .parse(req.body);

    const invoice = await FeeInvoice.findOne({ _id: body.invoiceId, ...instituteFilter(req) });
    if (!invoice) throw new AppError(404, 'NOT_FOUND', 'Invoice not found');
    if (invoice.status === 'cancelled' || invoice.status === 'paid') {
      throw new AppError(400, 'INVALID_STATE', 'Invoice cannot accept payments');
    }

    const paymentBatchId = newPaymentBatchId();
    const payment = await FeePayment.create({
      invoiceId: invoice._id,
      studentId: invoice.studentId,
      amount: body.amount,
      method: body.method ?? 'cash',
      reference: body.reference,
      receiptNo: paymentBatchId,
      paymentBatchId,
      paidAt: new Date(),
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });

    invoice.paidAmount += body.amount;
    if (invoice.paidAmount >= invoice.totalAmount) {
      invoice.status = 'paid';
      invoice.paidAmount = invoice.totalAmount;
    } else {
      invoice.status = 'partial';
    }
    Object.assign(invoice, actorFields(req));
    await invoice.save();

    const student = await Student.findById(invoice.studentId);
    void notify({
      channel: 'email',
      to: student?.email || 'accounts@institute.local',
      subject: `Fee receipt ${payment.receiptNo}`,
      body: `Payment of ₹${payment.amount} received for invoice ${invoice.invoiceNo}.`,
    }).catch(() => undefined);

    return ok(res, { payment, invoice }, undefined, 201);
  })
);

feesRouter.get(
  '/payments',
  requirePermission('fees.view'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req);
    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : undefined;
    const filter = {
      ...instituteFilter(req),
      ...(invoiceId ? { invoiceId } : {}),
    };

    // Invoice filter: keep raw rows. Otherwise one history line per payment action (batch).
    if (invoiceId) {
      const [items, total] = await Promise.all([
        FeePayment.find(filter)
          .populate('studentId', 'firstName lastName admissionNo')
          .populate('invoiceId', 'invoiceNo totalAmount paidAmount status billingMonth')
          .skip(skip)
          .limit(limit)
          .sort('-paidAt'),
        FeePayment.countDocuments(filter),
      ]);
      return ok(res, items, paginationMeta(page, limit, total));
    }

    const raw = await FeePayment.find(filter)
      .populate('studentId', 'firstName lastName admissionNo')
      .populate('invoiceId', 'invoiceNo totalAmount paidAmount status billingMonth')
      .sort('-paidAt')
      .lean();

    const groups = new Map<
      string,
      {
        _id: unknown;
        receiptNo: string;
        paymentBatchId: string;
        amount: number;
        method: string;
        reference?: string;
        paidAt: Date;
        studentId: unknown;
        invoiceId: unknown;
        allocationCount: number;
        paymentIds: string[];
      }
    >();

    for (const p of raw) {
      const studentKey =
        p.studentId && typeof p.studentId === 'object' && '_id' in p.studentId
          ? String((p.studentId as { _id: unknown })._id)
          : String(p.studentId);
      // Legacy settle rows share the same paidAt ms — group them as one payment.
      const key =
        p.paymentBatchId ||
        `${studentKey}|${new Date(p.paidAt).getTime()}|${p.method}|${p.reference || ''}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          _id: p._id,
          receiptNo: p.paymentBatchId || p.receiptNo,
          paymentBatchId: p.paymentBatchId || key,
          amount: Number(p.amount),
          method: p.method,
          reference: p.reference,
          paidAt: p.paidAt,
          studentId: p.studentId,
          invoiceId: p.invoiceId,
          allocationCount: 1,
          paymentIds: [String(p._id)],
        });
      } else {
        existing.amount = Math.round((existing.amount + Number(p.amount)) * 100) / 100;
        existing.allocationCount += 1;
        existing.paymentIds.push(String(p._id));
        // Prefer shortest receipt (batch id) over RCP-xxx-2 suffixes
        if (p.paymentBatchId && p.receiptNo === p.paymentBatchId) {
          existing.receiptNo = p.receiptNo;
          existing._id = p._id;
        } else if (!p.paymentBatchId && String(p.receiptNo).length < String(existing.receiptNo).length) {
          existing.receiptNo = p.receiptNo;
          existing._id = p._id;
        }
        if (new Date(p.paidAt).getTime() > new Date(existing.paidAt).getTime()) {
          existing.paidAt = p.paidAt;
        }
      }
    }

    const grouped = Array.from(groups.values()).sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime()
    );
    const total = grouped.length;
    const items = grouped.slice(skip, skip + limit);
    return ok(res, items, paginationMeta(page, limit, total));
  })
);

feesRouter.get(
  '/payments/:id/receipt.pdf',
  requirePermission('fees.view'),
  asyncHandler(async (req, res) => {
    const payment = await FeePayment.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!payment) throw new AppError(404, 'NOT_FOUND', 'Payment not found');

    // Load full batch (same payment action) for a single combined receipt
    let batchPayments = [payment];
    if (payment.paymentBatchId) {
      batchPayments = await FeePayment.find({
        ...instituteFilter(req),
        paymentBatchId: payment.paymentBatchId,
      }).sort('paidAt');
    } else {
      // Legacy: same student + paidAt + method = one payment action
      const legacyQ: Record<string, unknown> = {
        ...instituteFilter(req),
        studentId: payment.studentId,
        paidAt: payment.paidAt,
        method: payment.method,
      };
      if (payment.reference) legacyQ.reference = payment.reference;
      else {
        legacyQ.$or = [{ reference: { $exists: false } }, { reference: null }, { reference: '' }];
      }
      batchPayments = await FeePayment.find(legacyQ).sort('createdAt');
      if (!batchPayments.length) batchPayments = [payment];
    }

    const invoiceIds = [...new Set(batchPayments.map((p) => String(p.invoiceId)))];
    const [invoices, student, institute] = await Promise.all([
      FeeInvoice.find({ _id: { $in: invoiceIds } }),
      Student.findById(payment.studentId),
      Institute.findById(req.user!.instituteId),
    ]);
    if (!institute) throw new AppError(404, 'NOT_FOUND', 'Receipt data incomplete');
    const invoiceById = new Map(invoices.map((i) => [String(i._id), i]));
    const primaryInvoice = invoiceById.get(String(payment.invoiceId)) || invoices[0];
    if (!primaryInvoice) throw new AppError(404, 'NOT_FOUND', 'Receipt data incomplete');

    let className: string | undefined;
    let sectionName: string | undefined;
    let sessionName: string | undefined;
    if (student) {
      const enrollment = await Enrollment.findOne({
        instituteId: req.user!.instituteId,
        studentId: student._id,
        deletedAt: null,
        status: 'active',
      })
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .populate('sessionId', 'name')
        .sort('-createdAt');
      className = (enrollment?.classId as { name?: string } | undefined)?.name;
      sectionName = (enrollment?.sectionId as { name?: string } | undefined)?.name;
      sessionName = (enrollment?.sessionId as { name?: string } | undefined)?.name;
    }

    const batchAmount = Math.round(batchPayments.reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
    const displayReceiptNo = payment.paymentBatchId || payment.receiptNo;
    const allocations = batchPayments.map((p) => ({
      amount: p.amount,
      invoice: invoiceById.get(String(p.invoiceId)) || primaryInvoice,
    }));

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    await streamFeeReceiptPdf(res, {
      institute,
      payment: {
        ...payment.toObject(),
        amount: batchAmount,
        receiptNo: displayReceiptNo,
      },
      invoice: primaryInvoice,
      allocations: allocations.length > 1 ? allocations : undefined,
      inline,
      student: student
        ? {
            firstName: student.firstName,
            lastName: student.lastName,
            admissionNo: student.admissionNo,
            phone: student.phone,
            email: student.email,
            address: student.address,
            className,
            sectionName,
            sessionName,
          }
        : null,
    });
  })
);

feesRouter.get(
  '/students/:studentId/month-receipt.pdf',
  requirePermission('fees.view', 'students.view'),
  asyncHandler(async (req, res) => {
    const studentId = req.params.studentId;
    const month = typeof req.query.month === 'string' ? req.query.month : '';
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError(400, 'INVALID_MONTH', 'Query month=YYYY-MM is required');
    }

    const [student, institute] = await Promise.all([
      Student.findOne({ _id: studentId, ...instituteFilter(req) }),
      Institute.findById(req.user!.instituteId),
    ]);
    if (!student || !institute) throw new AppError(404, 'NOT_FOUND', 'Student or institute not found');

    const invoices = await FeeInvoice.find({
      ...instituteFilter(req),
      studentId,
      billingMonth: month,
      status: { $in: ['issued', 'partial', 'paid'] },
    }).lean();
    if (!invoices.length) throw new AppError(404, 'NOT_FOUND', 'No invoices for this month');

    const billedTotal = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const paidTotal = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const pendingTotal = Math.max(0, billedTotal - paidTotal);
    if (paidTotal <= 0) {
      throw new AppError(400, 'NO_PAYMENT', 'No amount paid for this month yet');
    }

    const invoiceIds = invoices.map((i) => i._id);
    const invoiceNoById = new Map(invoices.map((i) => [String(i._id), i.invoiceNo]));
    const payments = await FeePayment.find({
      ...instituteFilter(req),
      studentId,
      invoiceId: { $in: invoiceIds },
    })
      .sort('paidAt')
      .lean();
    if (!payments.length) {
      throw new AppError(400, 'NO_PAYMENT', 'No payment records found for this month');
    }

    let className: string | undefined;
    let sectionName: string | undefined;
    let sessionName: string | undefined;
    const enrollment = await Enrollment.findOne({
      instituteId: req.user!.instituteId,
      studentId: student._id,
      deletedAt: null,
    })
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .populate('sessionId', 'name')
      .sort('-createdAt');
    className = (enrollment?.classId as { name?: string } | undefined)?.name;
    sectionName = (enrollment?.sectionId as { name?: string } | undefined)?.name;
    sessionName = (enrollment?.sessionId as { name?: string } | undefined)?.name;

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    await streamMonthFeeReceiptPdf(res, {
      institute,
      month,
      billedTotal,
      paidTotal,
      pendingTotal,
      inline,
      payments: payments.map((p) => ({
        receiptNo: p.receiptNo,
        amount: p.amount,
        paidAt: p.paidAt,
        method: p.method,
        invoiceNo: invoiceNoById.get(String(p.invoiceId)),
        billingMonth: month,
      })),
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNo: student.admissionNo,
        phone: student.phone,
        email: student.email,
        address: student.address,
        className,
        sectionName,
        sessionName,
      },
    });
  })
);

feesRouter.get(
  '/students/:studentId/itr-statement.pdf',
  requirePermission('fees.view', 'students.view'),
  asyncHandler(async (req, res) => {
    const studentId = req.params.studentId;
    const asOf = new Date();
    const fy = indianFinancialYear(asOf);
    // Till end of today (local calendar day as UTC end-ish: use asOf directly)
    const till = asOf;

    const [student, institute] = await Promise.all([
      Student.findOne({ _id: studentId, ...instituteFilter(req) }),
      Institute.findById(req.user!.instituteId),
    ]);
    if (!student || !institute) throw new AppError(404, 'NOT_FOUND', 'Student or institute not found');

    const payments = await FeePayment.find({
      ...instituteFilter(req),
      studentId,
      paidAt: { $gte: fy.start, $lte: till },
      deletedAt: null,
    })
      .sort('paidAt')
      .lean();

    const invoiceIds = [...new Set(payments.map((p) => String(p.invoiceId)))];
    const invoices = invoiceIds.length
      ? await FeeInvoice.find({ _id: { $in: invoiceIds } }).select('invoiceNo billingMonth').lean()
      : [];
    const invMap = new Map(invoices.map((i) => [String(i._id), i]));

    let className: string | undefined;
    let sectionName: string | undefined;
    let sessionName: string | undefined;
    const enrollment = await Enrollment.findOne({
      instituteId: req.user!.instituteId,
      studentId: student._id,
      deletedAt: null,
    })
      .populate('classId', 'name')
      .populate('sectionId', 'name')
      .populate('sessionId', 'name')
      .sort('-createdAt');
    className = (enrollment?.classId as { name?: string } | undefined)?.name;
    sectionName = (enrollment?.sectionId as { name?: string } | undefined)?.name;
    sessionName = (enrollment?.sessionId as { name?: string } | undefined)?.name;

    const inline = req.query.inline === '1' || req.query.inline === 'true';
    await streamItrFeeStatementPdf(res, {
      institute,
      fyLabel: fy.label,
      fyStart: fy.start,
      asOf: till,
      inline,
      payments: payments.map((p) => {
        const inv = invMap.get(String(p.invoiceId));
        return {
          receiptNo: p.receiptNo,
          amount: p.amount,
          paidAt: p.paidAt,
          method: p.method,
          invoiceNo: inv?.invoiceNo,
          billingMonth: inv?.billingMonth,
        };
      }),
      student: {
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNo: student.admissionNo,
        phone: student.phone,
        email: student.email,
        address: student.address,
        className,
        sectionName,
        sessionName,
      },
    });
  })
);
