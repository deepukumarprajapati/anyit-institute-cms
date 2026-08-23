import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IVehicle {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  number: string;
  type: string;
  capacity: number;
  /** Painted / displayed bus route number (e.g. 12, R-01) */
  routeNumber?: string;
  /** Multiple trip slots, e.g. 07:30 → Route 1, 14:00 → Route 2 */
  timings?: { time: string; route: string; routeId?: Types.ObjectId }[];
  driverName?: string;
  driverPhone?: string;
  driverId?: Types.ObjectId;
  conductorId?: Types.ObjectId;
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
    routeNumber: String,
    timings: [
      {
        time: { type: String, required: true },
        route: { type: String, required: true },
        routeId: { type: Schema.Types.ObjectId, ref: 'TransportRoute' },
      },
    ],
    driverName: String,
    driverPhone: String,
    driverId: { type: Schema.Types.ObjectId, ref: 'TransportCrew' },
    conductorId: { type: Schema.Types.ObjectId, ref: 'TransportCrew' },
    ...auditFields,
  },
  { timestamps: true }
);

vehicleSchema.index({ instituteId: 1, number: 1 }, { unique: true });
export const Vehicle = model<IVehicle>('Vehicle', vehicleSchema);

export interface ITransportCrew {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  role: 'driver' | 'conductor';
  name: string;
  phone?: string;
  photoUrl?: string;
  vehicleId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const transportCrewSchema = new Schema<ITransportCrew>(
  {
    ...instituteScoped,
    role: { type: String, enum: ['driver', 'conductor'], required: true },
    name: { type: String, required: true },
    phone: String,
    photoUrl: String,
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle' },
    ...auditFields,
  },
  { timestamps: true }
);

transportCrewSchema.index({ instituteId: 1, role: 1, name: 1 });
export const TransportCrew = model<ITransportCrew>('TransportCrew', transportCrewSchema);

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

export const TRANSPORT_LOG_CHANGES = ['assigned', 'route_changed', 'unassigned', 'left_school'] as const;
export type TransportLogChange = (typeof TRANSPORT_LOG_CHANGES)[number];

/** Dated student-on-route history so a bus day can show who boarded, moved, or left */
export interface IStudentTransportLog {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  routeId: Types.ObjectId;
  stopName: string;
  dateFrom: string;
  dateTo?: string;
  changeType: TransportLogChange;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const studentTransportLogSchema = new Schema<IStudentTransportLog>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'TransportRoute', required: true },
    stopName: { type: String, required: true },
    dateFrom: { type: String, required: true },
    dateTo: String,
    changeType: { type: String, enum: TRANSPORT_LOG_CHANGES, default: 'assigned' },
    ...auditFields,
  },
  { timestamps: true }
);

studentTransportLogSchema.index({ instituteId: 1, studentId: 1, dateFrom: -1 });
studentTransportLogSchema.index({ instituteId: 1, routeId: 1, dateFrom: -1 });
export const StudentTransportLog = model<IStudentTransportLog>(
  'StudentTransportLog',
  studentTransportLogSchema
);

/** Dated assignment: which bus ran which route, with which driver / conductor */
export interface ITransportDuty {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  dateFrom: string;
  dateTo?: string;
  vehicleId: Types.ObjectId;
  route: string;
  routeId?: Types.ObjectId;
  time?: string;
  driverId?: Types.ObjectId;
  conductorId?: Types.ObjectId;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const transportDutySchema = new Schema<ITransportDuty>(
  {
    ...instituteScoped,
    dateFrom: { type: String, required: true },
    dateTo: String,
    vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
    route: { type: String, required: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'TransportRoute' },
    time: String,
    driverId: { type: Schema.Types.ObjectId, ref: 'TransportCrew' },
    conductorId: { type: Schema.Types.ObjectId, ref: 'TransportCrew' },
    notes: String,
    ...auditFields,
  },
  { timestamps: true }
);

transportDutySchema.index({ instituteId: 1, vehicleId: 1, dateFrom: -1 });
transportDutySchema.index({ instituteId: 1, driverId: 1, dateFrom: -1 });
transportDutySchema.index({ instituteId: 1, conductorId: 1, dateFrom: -1 });
export const TransportDuty = model<ITransportDuty>('TransportDuty', transportDutySchema);

export const RELIEF_REASONS = ['emergency_leave', 'sick', 'personal', 'shift_swap', 'custom', 'other'] as const;
export type ReliefReason = (typeof RELIEF_REASONS)[number];

/** Short-term cover when the rostered driver/conductor is on leave */
export interface ITransportRelief {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  dutyId: Types.ObjectId;
  dateFrom: string;
  dateTo?: string;
  role: 'driver' | 'conductor';
  originalId: Types.ObjectId;
  reliefId: Types.ObjectId;
  reason: ReliefReason;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const transportReliefSchema = new Schema<ITransportRelief>(
  {
    ...instituteScoped,
    dutyId: { type: Schema.Types.ObjectId, ref: 'TransportDuty', required: true },
    dateFrom: { type: String, required: true },
    dateTo: String,
    role: { type: String, enum: ['driver', 'conductor'], required: true },
    originalId: { type: Schema.Types.ObjectId, ref: 'TransportCrew', required: true },
    reliefId: { type: Schema.Types.ObjectId, ref: 'TransportCrew', required: true },
    reason: { type: String, enum: RELIEF_REASONS, default: 'custom' },
    notes: String,
    ...auditFields,
  },
  { timestamps: true }
);

transportReliefSchema.index({ instituteId: 1, dutyId: 1, dateFrom: -1 });
transportReliefSchema.index({ instituteId: 1, originalId: 1, dateFrom: -1 });
transportReliefSchema.index({ instituteId: 1, reliefId: 1, dateFrom: -1 });
export const TransportRelief = model<ITransportRelief>('TransportRelief', transportReliefSchema);
