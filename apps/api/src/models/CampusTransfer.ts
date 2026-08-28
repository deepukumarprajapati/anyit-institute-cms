import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface ICampusTransfer {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  fromCampusId?: Types.ObjectId;
  toCampusId: Types.ObjectId;
  effectiveMonth: string;
  reason?: string;
  notes?: string;
  cancelledInvoiceIds: Types.ObjectId[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const campusTransferSchema = new Schema<ICampusTransfer>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    fromCampusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
    toCampusId: { type: Schema.Types.ObjectId, ref: 'Campus', required: true },
    effectiveMonth: { type: String, required: true },
    reason: String,
    notes: String,
    cancelledInvoiceIds: [{ type: Schema.Types.ObjectId, ref: 'FeeInvoice' }],
    ...auditFields,
  },
  { timestamps: true }
);

campusTransferSchema.index({ instituteId: 1, studentId: 1, createdAt: -1 });

export const CampusTransfer = model<ICampusTransfer>('CampusTransfer', campusTransferSchema);
