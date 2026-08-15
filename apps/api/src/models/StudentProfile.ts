import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IComplaint {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId?: Types.ObjectId;
  title: string;
  category: 'behavior' | 'academic' | 'transport' | 'fee' | 'bullying' | 'other';
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  raisedBy?: string;
  raisedOn: Date;
  resolution?: string;
  resolvedOn?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const complaintSchema = new Schema<IComplaint>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession' },
    title: { type: String, required: true },
    category: {
      type: String,
      enum: ['behavior', 'academic', 'transport', 'fee', 'bullying', 'other'],
      default: 'other',
    },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    raisedBy: String,
    raisedOn: { type: Date, default: Date.now },
    resolution: String,
    resolvedOn: Date,
    ...auditFields,
  },
  { timestamps: true }
);

export const Complaint = model<IComplaint>('Complaint', complaintSchema);

export interface IMedicalRecord {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId?: Types.ObjectId;
  recordDate: Date;
  bloodGroup?: string;
  heightCm?: number;
  weightKg?: number;
  allergies?: string[];
  conditions?: string[];
  medications?: string[];
  notes?: string;
  doctorName?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const medicalSchema = new Schema<IMedicalRecord>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession' },
    recordDate: { type: Date, default: Date.now },
    bloodGroup: String,
    heightCm: Number,
    weightKg: Number,
    allergies: [String],
    conditions: [String],
    medications: [String],
    notes: String,
    doctorName: String,
    ...auditFields,
  },
  { timestamps: true }
);

export const MedicalRecord = model<IMedicalRecord>('MedicalRecord', medicalSchema);

export interface IAcademicMark {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId: Types.ObjectId;
  examName: string;
  examType: 'term' | 'final' | 'midterm' | 'practical' | 'other';
  subject: string;
  maxMarks: number;
  obtainedMarks: number;
  grade?: string;
  remarks?: string;
  examDate?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const academicMarkSchema = new Schema<IAcademicMark>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    examName: { type: String, required: true },
    examType: {
      type: String,
      enum: ['term', 'final', 'midterm', 'practical', 'other'],
      default: 'term',
    },
    subject: { type: String, required: true },
    maxMarks: { type: Number, required: true },
    obtainedMarks: { type: Number, required: true },
    grade: String,
    remarks: String,
    examDate: Date,
    ...auditFields,
  },
  { timestamps: true }
);

export const AcademicMark = model<IAcademicMark>('AcademicMark', academicMarkSchema);

export interface IUnitTestReport {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId: Types.ObjectId;
  unitName: string;
  subject: string;
  testDate: Date;
  maxMarks: number;
  obtainedMarks: number;
  rank?: number;
  teacherRemark?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const unitTestSchema = new Schema<IUnitTestReport>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    unitName: { type: String, required: true },
    subject: { type: String, required: true },
    testDate: { type: Date, required: true },
    maxMarks: { type: Number, required: true },
    obtainedMarks: { type: Number, required: true },
    rank: Number,
    teacherRemark: String,
    ...auditFields,
  },
  { timestamps: true }
);

export const UnitTestReport = model<IUnitTestReport>('UnitTestReport', unitTestSchema);

export interface IEventParticipation {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId?: Types.ObjectId;
  eventId?: Types.ObjectId;
  eventTitle: string;
  eventDate: Date;
  role: 'participant' | 'volunteer' | 'winner' | 'audience' | 'organizer';
  attendance: 'present' | 'absent' | 'late';
  result?: string;
  remarks?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const eventParticipationSchema = new Schema<IEventParticipation>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession' },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event' },
    eventTitle: { type: String, required: true },
    eventDate: { type: Date, required: true },
    role: {
      type: String,
      enum: ['participant', 'volunteer', 'winner', 'audience', 'organizer'],
      default: 'participant',
    },
    attendance: {
      type: String,
      enum: ['present', 'absent', 'late'],
      default: 'present',
    },
    result: String,
    remarks: String,
    ...auditFields,
  },
  { timestamps: true }
);

export const EventParticipation = model<IEventParticipation>(
  'EventParticipation',
  eventParticipationSchema
);
