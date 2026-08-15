import { Schema, model, Types } from 'mongoose';
import { StudentStatus } from '@anyit/shared';
import { auditFields, instituteScoped } from './base';

export interface IGuardian {
  name: string;
  relation: string;
  phone?: string;
  email?: string;
  isPrimary?: boolean;
}

export interface IStudent {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  admissionNo: string;
  firstName: string;
  lastName?: string;
  dob?: Date;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: StudentStatus;
  guardians: IGuardian[];
  documents: { name: string; url: string; uploadedAt: Date }[];
  photoUrl?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const studentSchema = new Schema<IStudent>(
  {
    ...instituteScoped,
    admissionNo: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: String,
    dob: Date,
    gender: String,
    phone: String,
    email: String,
    address: String,
    status: { type: String, enum: ['active', 'alumni', 'left', 'suspended'], default: 'active' },
    guardians: [
      {
        name: String,
        relation: String,
        phone: String,
        email: String,
        isPrimary: Boolean,
      },
    ],
    documents: [
      {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    photoUrl: String,
    ...auditFields,
  },
  { timestamps: true }
);

studentSchema.index({ instituteId: 1, admissionNo: 1 }, { unique: true });
studentSchema.index({ instituteId: 1, firstName: 'text', lastName: 'text', admissionNo: 'text' });

export const Student = model<IStudent>('Student', studentSchema);

export interface IEnrollment {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;
  classroomId?: Types.ObjectId;
  rollNo?: string;
  status: 'active' | 'transferred' | 'completed';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'SchoolClass', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    classroomId: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    rollNo: String,
    status: { type: String, enum: ['active', 'transferred', 'completed'], default: 'active' },
    ...auditFields,
  },
  { timestamps: true }
);

enrollmentSchema.index({ instituteId: 1, studentId: 1, sessionId: 1 }, { unique: true });

export const Enrollment = model<IEnrollment>('Enrollment', enrollmentSchema);
