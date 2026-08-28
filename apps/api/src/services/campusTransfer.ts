import { Types } from 'mongoose';
import { Campus } from '../models/Campus';
import { CampusTransfer } from '../models/CampusTransfer';
import { FeeInvoice } from '../models/Fee';
import { IStudent, Student } from '../models/Student';
import { AppError } from '../utils/errors';
import { currentMonthKey } from '../utils/campusScope';
import { notDeleted } from '../models/base';

export async function applyCampusTransfer(opts: {
  student: InstanceType<typeof Student>;
  toCampusId: string;
  effectiveMonth?: string;
  reason?: string;
  notes?: string;
  actorId?: string;
  instituteId: string;
}) {
  const month = opts.effectiveMonth || currentMonthKey();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError(400, 'INVALID_MONTH', 'effectiveMonth must be YYYY-MM');
  }
  const toCampus = await Campus.findOne({
    _id: opts.toCampusId,
    instituteId: opts.instituteId,
    ...notDeleted(),
  });
  if (!toCampus) throw new AppError(400, 'INVALID_CAMPUS', 'Destination campus not found');

  const fromId = opts.student.campusId ? String(opts.student.campusId) : undefined;
  if (fromId === String(toCampus._id)) {
    throw new AppError(400, 'SAME_CAMPUS', 'Student is already at this campus');
  }

  const history = [...(opts.student.campusHistory || [])];
  const open = [...history].reverse().find((row) => !row.toMonth);
  if (open) {
    open.toMonth = month;
  } else if (fromId && opts.student.campusId) {
    history.push({
      campusId: opts.student.campusId,
      fromMonth: month,
      toMonth: month,
      reason: 'previous',
      notes: 'Campus before this transfer',
      transferredAt: new Date(),
    });
  }
  history.push({
    campusId: toCampus._id,
    fromMonth: month,
    toMonth: null,
    reason: opts.reason || 'parent_relocation',
    notes: opts.notes,
    transferredAt: new Date(),
    transferredBy: opts.actorId ? new Types.ObjectId(opts.actorId) : undefined,
  });

  const openInvoices = await FeeInvoice.find({
    instituteId: opts.instituteId,
    studentId: opts.student._id,
    status: { $in: ['issued', 'partial'] },
    deletedAt: null,
    $or: [{ billingMonth: { $gte: month } }, { billingMonth: { $in: [null, ''] } }],
  });

  const cancelledIds: Types.ObjectId[] = [];
  for (const inv of openInvoices) {
    const due = Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100;
    if (due <= 0) continue;
    if ((inv.paidAmount || 0) > 0) continue;
    const invMonth = inv.billingMonth || '';
    if (invMonth && invMonth < month) continue;
    inv.status = 'cancelled';
    await inv.save();
    cancelledIds.push(inv._id);
  }

  opts.student.campusId = toCampus._id;
  opts.student.campusHistory = history;
  if (opts.actorId) opts.student.updatedBy = new Types.ObjectId(opts.actorId);
  await opts.student.save();

  const transfer = await CampusTransfer.create({
    instituteId: opts.instituteId,
    studentId: opts.student._id,
    fromCampusId: fromId,
    toCampusId: toCampus._id,
    effectiveMonth: month,
    reason: opts.reason || 'parent_relocation',
    notes: opts.notes,
    cancelledInvoiceIds: cancelledIds,
    createdBy: opts.actorId,
    updatedBy: opts.actorId,
  });

  return { transfer, cancelledCount: cancelledIds.length, student: opts.student as IStudent };
}
