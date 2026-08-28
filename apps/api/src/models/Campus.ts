import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface ICampus {
  instituteId: Types.ObjectId;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  pincode?: string;
  /** Affiliation / UDISE-style code. Branches only — never head office. */
  schoolCode?: string;
  mapUrl?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
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
    pincode: String,
    schoolCode: String,
    mapUrl: String,
    latitude: Number,
    longitude: Number,
    imageUrl: String,
    isPrimary: { type: Boolean, default: false },
    ...auditFields,
  },
  { timestamps: true }
);

campusSchema.index({ instituteId: 1, code: 1 }, { unique: true });
campusSchema.index(
  { instituteId: 1, schoolCode: 1 },
  { unique: true, partialFilterExpression: { schoolCode: { $type: 'string' } } }
);

export const Campus = model<ICampus>('Campus', campusSchema);
