import { Schema, model, Types } from 'mongoose';
import { auditFields, instituteScoped } from './base';

export interface IUser {
  instituteId: Types.ObjectId;
  campusId?: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  phone?: string;
  roleId: Types.ObjectId;
  isActive: boolean;
  refreshTokenHash?: string | null;
  lastLoginAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const userSchema = new Schema<IUser>(
  {
    ...instituteScoped,
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    phone: String,
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    isActive: { type: Boolean, default: true },
    refreshTokenHash: { type: String, default: null },
    lastLoginAt: Date,
    ...auditFields,
  },
  { timestamps: true }
);

userSchema.index({ instituteId: 1, email: 1 }, { unique: true });

export const User = model<IUser>('User', userSchema);
