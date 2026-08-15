import { Schema, model, Types } from 'mongoose';
import { Permission } from '@anyit/shared';
import { auditFields, instituteScoped } from './base';

export interface IRole {
  instituteId: Types.ObjectId;
  key: string;
  name: string;
  description?: string;
  permissions: Permission[] | ['*'];
  isSystem: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const roleSchema = new Schema<IRole>(
  {
    ...instituteScoped,
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
    ...auditFields,
  },
  { timestamps: true }
);

roleSchema.index({ instituteId: 1, key: 1 }, { unique: true });

export const Role = model<IRole>('Role', roleSchema);
