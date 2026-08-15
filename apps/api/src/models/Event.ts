import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IEventPhoto {
  _id?: Types.ObjectId;
  url: string;
  caption?: string;
  uploadedAt: Date;
}

export interface IEvent {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  audience: 'all' | 'students' | 'staff' | 'parents';
  photos: IEventPhoto[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const eventPhotoSchema = new Schema<IEventPhoto>(
  {
    url: { type: String, required: true },
    caption: String,
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const eventSchema = new Schema<IEvent>(
  {
    ...instituteScoped,
    campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
    title: { type: String, required: true },
    description: String,
    location: String,
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    audience: {
      type: String,
      enum: ['all', 'students', 'staff', 'parents'],
      default: 'all',
    },
    photos: { type: [eventPhotoSchema], default: [] },
    ...auditFields,
  },
  { timestamps: true }
);

eventSchema.index({ instituteId: 1, startAt: 1 });
export const Event = model<IEvent>('Event', eventSchema);
