import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IVehicle {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  number: string;
  type: string;
  capacity: number;
  driverName?: string;
  driverPhone?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const vehicleSchema = new Schema<IVehicle>(
  {
    ...instituteScoped,
    number: { type: String, required: true },
    type: { type: String, default: 'bus' },
    capacity: { type: Number, default: 40 },
    driverName: String,
    driverPhone: String,
    ...auditFields,
  },
  { timestamps: true }
);

vehicleSchema.index({ instituteId: 1, number: 1 }, { unique: true });
export const Vehicle = model<IVehicle>('Vehicle', vehicleSchema);

export interface ITransportRoute {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  name: string;
  vehicleId?: Types.ObjectId;
  stops: { name: string; order: number; pickupTime?: string }[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const transportRouteSchema = new Schema<ITransportRoute>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    stops: [{ name: String, order: Number, pickupTime: String }],
    ...auditFields,
  },
  { timestamps: true }
);

export const TransportRoute = model<ITransportRoute>('TransportRoute', transportRouteSchema);

/** Distance-based transport fee slabs (not class-wide — assigned per student) */
export interface ITransportFeeTier {
  instituteId: Types.ObjectId;
  name: string;
  /** Inclusive upper distance in km (e.g. 5 = up to 5 km) */
  maxKm: number;
  /** Monthly transport fee for this distance slab */
  monthlyAmount: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const transportFeeTierSchema = new Schema<ITransportFeeTier>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    maxKm: { type: Number, required: true },
    monthlyAmount: { type: Number, required: true },
    ...auditFields,
  },
  { timestamps: true }
);

transportFeeTierSchema.index({ instituteId: 1, maxKm: 1 });
export const TransportFeeTier = model<ITransportFeeTier>('TransportFeeTier', transportFeeTierSchema);

export interface IStudentTransport {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  routeId: Types.ObjectId;
  stopName: string;
  /** Distance slab that determines monthly fee */
  feeTierId?: Types.ObjectId;
  /** Snapshot of monthly fee from selected tier */
  monthlyFee: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const studentTransportSchema = new Schema<IStudentTransport>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    stopName: { type: String, required: true },
    feeTierId: { type: Schema.Types.ObjectId, ref: 'TransportFeeTier' },
    monthlyFee: { type: Number, default: 0 },
    ...auditFields,
  },
  { timestamps: true }
);

studentTransportSchema.index({ instituteId: 1, studentId: 1 }, { unique: true });
export const StudentTransport = model<IStudentTransport>('StudentTransport', studentTransportSchema);
