import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface ISchoolClass {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  name: string;
  code: string;
  order: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const schoolClassSchema = new Schema<ISchoolClass>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    code: { type: String, required: true },
    order: { type: Number, default: 0 },
    ...auditFields,
  },
  { timestamps: true }
);

schoolClassSchema.index({ instituteId: 1, code: 1 }, { unique: true });

export const SchoolClass = model<ISchoolClass>('SchoolClass', schoolClassSchema);

export interface ISection {
  instituteId: Types.ObjectId;
  classId: Types.ObjectId;
  name: string;
  capacity?: number;
  classroomId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const sectionSchema = new Schema<ISection>(
  {
    ...instituteScoped,
    classId: { type: Schema.Types.ObjectId, ref: 'SchoolClass', required: true },
    name: { type: String, required: true },
    capacity: Number,
    classroomId: { type: Schema.Types.ObjectId, ref: 'Classroom' },
    ...auditFields,
  },
  { timestamps: true }
);

sectionSchema.index({ instituteId: 1, classId: 1, name: 1 }, { unique: true });

export const Section = model<ISection>('Section', sectionSchema);

export interface ISubject {
  instituteId: Types.ObjectId;
  name: string;
  code: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const subjectSchema = new Schema<ISubject>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    code: { type: String, required: true },
    ...auditFields,
  },
  { timestamps: true }
);

subjectSchema.index({ instituteId: 1, code: 1 }, { unique: true });

export const Subject = model<ISubject>('Subject', subjectSchema);

export interface IFloor {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  name: string;
  code: string;
  level: number;
  building?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const floorSchema = new Schema<IFloor>(
  {
    ...instituteScoped,
    campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
    name: { type: String, required: true },
    code: { type: String, required: true },
    level: { type: Number, default: 0 },
    building: String,
    ...auditFields,
  },
  { timestamps: true }
);

floorSchema.index({ instituteId: 1, code: 1 }, { unique: true });

export const Floor = model<IFloor>('Floor', floorSchema);

export interface IClassroom {
  instituteId: Types.ObjectId;
  floorId: Types.ObjectId;
  campusId?: Types.ObjectId;
  name: string;
  code: string;
  capacity?: number;
  roomType?: 'classroom' | 'lab' | 'library' | 'office' | 'other';
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const classroomSchema = new Schema<IClassroom>(
  {
    ...instituteScoped,
    floorId: { type: Schema.Types.ObjectId, ref: 'Floor', required: true, index: true },
    campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
    name: { type: String, required: true },
    code: { type: String, required: true },
    capacity: Number,
    roomType: {
      type: String,
      enum: ['classroom', 'lab', 'library', 'office', 'other'],
      default: 'classroom',
    },
    ...auditFields,
  },
  { timestamps: true }
);

classroomSchema.index({ instituteId: 1, code: 1 }, { unique: true });

export const Classroom = model<IClassroom>('Classroom', classroomSchema);
