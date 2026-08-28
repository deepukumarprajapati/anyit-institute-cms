import { Schema, model, Types } from 'mongoose';
import { auditFields } from './base';

export interface IInstitute {
  name: string;
  code: string;
  email?: string;
  phone?: string;
  address?: string;
  pincode?: string;
  logoUrl?: string;
  loginBackgroundUrl?: string;
  settings: {
    timezone: string;
    currency: string;
    academicYearLabel?: string;
  };
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
  version?: number;
}

const instituteSchema = new Schema<IInstitute>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    email: String,
    phone: String,
    address: String,
    pincode: String,
    logoUrl: String,
    loginBackgroundUrl: String,
    settings: {
      timezone: { type: String, default: 'Asia/Kolkata' },
      currency: { type: String, default: 'INR' },
      academicYearLabel: String,
    },
    ...auditFields,
  },
  { timestamps: true }
);

export const Institute = model<IInstitute>('Institute', instituteSchema);
