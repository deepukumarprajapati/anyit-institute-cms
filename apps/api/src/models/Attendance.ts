import { Schema, model, Types } from 'mongoose';
import { AttendanceStatus } from '@anyit/shared';
import { auditFields, instituteScoped } from './base';

export interface IStudentAttendance {
  instituteId: Types.ObjectId;
  sessionId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId;
  studentId: Types.ObjectId;
  date: string;
  status: AttendanceStatus;
  remark?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const studentAttendanceSchema = new Schema<IStudentAttendance>(
  {
    ...instituteScoped,
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'SchoolClass', required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: 'Section', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: String, required: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'half_day', 'excused'],
      required: true,
    },
    remark: String,
    ...auditFields,
  },
  { timestamps: true }
);

studentAttendanceSchema.index(
  { instituteId: 1, studentId: 1, date: 1 },
  { unique: true }
);

export const StudentAttendance = model<IStudentAttendance>(
  'StudentAttendance',
  studentAttendanceSchema
);

export interface IStaffAttendance {
  instituteId: Types.ObjectId;
  staffId: Types.ObjectId;
  date: string;
  status: AttendanceStatus;
  remark?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const staffAttendanceSchema = new Schema<IStaffAttendance>(
  {
    ...instituteScoped,
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    date: { type: String, required: true },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'half_day', 'excused'],
      required: true,
    },
    remark: String,
    ...auditFields,
  },
  { timestamps: true }
);

staffAttendanceSchema.index({ instituteId: 1, staffId: 1, date: 1 }, { unique: true });

export const StaffAttendance = model<IStaffAttendance>('StaffAttendance', staffAttendanceSchema);

export interface IHoliday {
  instituteId: Types.ObjectId;
  name: string;
  date: string;
  type: 'holiday' | 'optional' | 'event_off';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const holidaySchema = new Schema<IHoliday>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    date: { type: String, required: true },
    type: { type: String, enum: ['holiday', 'optional', 'event_off'], default: 'holiday' },
    ...auditFields,
  },
  { timestamps: true }
);

holidaySchema.index({ instituteId: 1, date: 1 }, { unique: true });

export const Holiday = model<IHoliday>('Holiday', holidaySchema);
