import { Schema, model, Types } from 'mongoose';

export interface IAuditLog {
  instituteId: Types.ObjectId;
  userId?: Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: string;
  method: string;
  path: string;
  ip?: string;
  meta?: unknown;
  createdAt?: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: String,
    method: String,
    path: String,
    ip: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
