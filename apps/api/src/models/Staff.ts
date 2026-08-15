import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IStaff {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  employeeCode: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  department?: string;
  designation?: string;
  joiningDate?: Date;
  userId?: Types.ObjectId;
  status: 'active' | 'inactive' | 'resigned';
  photoUrl?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const staffSchema = new Schema<IStaff>(
  {
    ...instituteScoped,
    employeeCode: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: String,
    email: String,
    phone: String,
    department: String,
    designation: String,
    joiningDate: Date,
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'inactive', 'resigned'], default: 'active' },
    photoUrl: String,
    ...auditFields,
  },
  { timestamps: true }
);

staffSchema.index({ instituteId: 1, employeeCode: 1 }, { unique: true });

export const Staff = model<IStaff>('Staff', staffSchema);
