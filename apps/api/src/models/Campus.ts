import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface ICampus {
  instituteId: Types.ObjectId;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isPrimary: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const campusSchema = new Schema<ICampus>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: String,
    phone: String,
    isPrimary: { type: Boolean, default: false },
    ...auditFields,
  },
  { timestamps: true }
);

campusSchema.index({ instituteId: 1, code: 1 }, { unique: true });

export const Campus = model<ICampus>('Campus', campusSchema);
