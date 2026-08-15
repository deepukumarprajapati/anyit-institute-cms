import { Schema, model, Types } from 'mongoose';
import { PayrollStatus } from '@anyit/shared';
import { auditFields, instituteScoped } from './base';

export interface ISalaryStructure {
  instituteId: Types.ObjectId;
  staffId: Types.ObjectId;
  basic: number;
  allowances: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  effectiveFrom: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const salaryStructureSchema = new Schema<ISalaryStructure>(
  {
    ...instituteScoped,
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    basic: { type: Number, required: true },
    allowances: [{ name: String, amount: Number }],
    deductions: [{ name: String, amount: Number }],
    effectiveFrom: { type: Date, required: true },
    ...auditFields,
  },
  { timestamps: true }
);

export const SalaryStructure = model<ISalaryStructure>('SalaryStructure', salaryStructureSchema);

export interface IPayroll {
  instituteId: Types.ObjectId;
  staffId: Types.ObjectId;
  month: string;
  basic: number;
  allowancesTotal: number;
  deductionsTotal: number;
  netPay: number;
  status: PayrollStatus;
  paidAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const payrollSchema = new Schema<IPayroll>(
  {
    ...instituteScoped,
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
    month: { type: String, required: true },
    basic: { type: Number, required: true },
    allowancesTotal: { type: Number, default: 0 },
    deductionsTotal: { type: Number, default: 0 },
    netPay: { type: Number, required: true },
    status: { type: String, enum: ['draft', 'processed', 'paid'], default: 'processed' },
    paidAt: Date,
    ...auditFields,
  },
  { timestamps: true }
);

payrollSchema.index({ instituteId: 1, staffId: 1, month: 1 }, { unique: true });
export const Payroll = model<IPayroll>('Payroll', payrollSchema);
