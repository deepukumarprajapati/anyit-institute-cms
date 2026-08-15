import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IAcademicSession {
  instituteId: Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const academicSessionSchema = new Schema<IAcademicSession>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    isActive: { type: Boolean, default: false },
    ...auditFields,
  },
  { timestamps: true }
);

academicSessionSchema.index({ instituteId: 1, name: 1 }, { unique: true });

export const AcademicSession = model<IAcademicSession>('AcademicSession', academicSessionSchema);
