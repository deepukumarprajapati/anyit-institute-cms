import { Schema, Types } from 'mongoose';

export type SoftDocument = {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
  version?: number;
};

export const auditFields = {
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date, default: null },
  version: { type: Number, default: 1 },
};

export const instituteScoped = {
  instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
  campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
};

export function notDeleted() {
  return { deletedAt: null };
}
