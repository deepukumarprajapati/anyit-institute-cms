import { Schema, model, Types } from 'mongoose';
import { FeeApplicability, FeeCategory, FeeInvoiceStatus } from '@anyit/shared';
import { auditFields, instituteScoped } from './base';

export interface IFeeHead {
  instituteId: Types.ObjectId;
  name: string;
  code: string;
  category: FeeCategory;
  /** class = apply to selected classes; transport = distance tiers; adhoc = one-off student charges */
  applicability: FeeApplicability;
  /** When applicability is class — empty means no class yet (must pick classes) */
  classIds: Types.ObjectId[];
  /** Default amount for class-scoped heads */
  defaultAmount: number;
  isOptional: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const categoryEnum = [
  'tuition',
  'transport',
  'dress',
  'event',
  'lab',
  'library',
  'hostel',
  'exam',
  'annual',
  'fine',
  'other',
];

const feeHeadSchema = new Schema<IFeeHead>(
  {
    ...instituteScoped,
    name: { type: String, required: true },
    code: { type: String, required: true },
    category: {
      type: String,
      enum: categoryEnum,
      default: 'other',
      index: true,
    },
    applicability: {
      type: String,
      enum: ['class', 'transport', 'adhoc'],
      default: 'class',
      index: true,
    },
    classIds: [{ type: Schema.Types.ObjectId, ref: 'SchoolClass' }],
    defaultAmount: { type: Number, default: 0 },
    isOptional: { type: Boolean, default: false },
    ...auditFields,
  },
  { timestamps: true }
);

feeHeadSchema.index({ instituteId: 1, code: 1 }, { unique: true });
export const FeeHead = model<IFeeHead>('FeeHead', feeHeadSchema);

export interface IFeeStructure {
  instituteId: Types.ObjectId;
  sessionId: Types.ObjectId;
  classId: Types.ObjectId;
  campusId?: Types.ObjectId;
  name: string;
  items: { feeHeadId: Types.ObjectId; amount: number }[];
  lateFeePerDay?: number;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const feeStructureSchema = new Schema<IFeeStructure>(
  {
    ...instituteScoped,
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'SchoolClass', required: true },
    campusId: { type: Schema.Types.ObjectId, ref: 'Campus' },
    name: { type: String, required: true },
    items: [
      {
        feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead', required: true },
        amount: { type: Number, required: true },
      },
    ],
    lateFeePerDay: { type: Number, default: 0 },
    ...auditFields,
  },
  { timestamps: true }
);

export const FeeStructure = model<IFeeStructure>('FeeStructure', feeStructureSchema);

export type FeeInvoiceItem = {
  name: string;
  amount: number;
  category?: FeeCategory;
  /** Free-text label (legacy; prefer description) */
  categoryLabel?: string;
  /** Longer notes for adhoc / other fees */
  description?: string;
  feeHeadId?: Types.ObjectId;
  billingMonth?: string;
};

export interface IFeeInvoice {
  instituteId: Types.ObjectId;
  studentId: Types.ObjectId;
  sessionId: Types.ObjectId;
  structureId?: Types.ObjectId;
  /** Campus this invoice was billed under (student's branch for that month). */
  campusId?: Types.ObjectId;
  invoiceNo: string;
  /** Billing month YYYY-MM — which month this invoice covers */
  billingMonth?: string;
  dueDate?: Date;
  items: FeeInvoiceItem[];
  discount: number;
  lateFee: number;
  totalAmount: number;
  paidAmount: number;
  status: FeeInvoiceStatus;
  /** adhoc | structure | transport | manual | advance */
  source?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
  createdAt?: Date;
}

const feeInvoiceSchema = new Schema<IFeeInvoice>(
  {
    ...instituteScoped,
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    sessionId: { type: Schema.Types.ObjectId, ref: 'AcademicSession', required: true },
    structureId: { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
    campusId: { type: Schema.Types.ObjectId, ref: 'Campus', index: true },
    invoiceNo: { type: String, required: true },
    billingMonth: { type: String, index: true },
    dueDate: Date,
    items: [
      {
        name: String,
        amount: Number,
        category: {
          type: String,
          enum: categoryEnum,
        },
        categoryLabel: String,
        description: String,
        feeHeadId: { type: Schema.Types.ObjectId, ref: 'FeeHead' },
        billingMonth: String,
      },
    ],
    discount: { type: Number, default: 0 },
    lateFee: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'issued', 'partial', 'paid', 'cancelled'],
      default: 'issued',
    },
    source: { type: String, default: 'manual' },
    ...auditFields,
  },
  { timestamps: true }
);

feeInvoiceSchema.index({ instituteId: 1, invoiceNo: 1 }, { unique: true });
feeInvoiceSchema.index({ instituteId: 1, studentId: 1, billingMonth: 1 });
export const FeeInvoice = model<IFeeInvoice>('FeeInvoice', feeInvoiceSchema);

export interface IFeePayment {
  instituteId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  studentId: Types.ObjectId;
  amount: number;
  method: 'cash' | 'upi' | 'card' | 'bank' | 'other';
  reference?: string;
  paidAt: Date;
  receiptNo: string;
  /** Same id for all invoice allocations from one payment action → one history line */
  paymentBatchId?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  deletedAt?: Date | null;
}

const feePaymentSchema = new Schema<IFeePayment>(
  {
    ...instituteScoped,
    invoiceId: { type: Schema.Types.ObjectId, ref: 'FeeInvoice', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    amount: { type: Number, required: true },
    method: { type: String, enum: ['cash', 'upi', 'card', 'bank', 'other'], default: 'cash' },
    reference: String,
    paidAt: { type: Date, default: Date.now },
    receiptNo: { type: String, required: true },
    paymentBatchId: { type: String, index: true },
    ...auditFields,
  },
  { timestamps: true }
);

feePaymentSchema.index({ instituteId: 1, receiptNo: 1 }, { unique: true });
feePaymentSchema.index({ instituteId: 1, paymentBatchId: 1, paidAt: -1 });
export const FeePayment = model<IFeePayment>('FeePayment', feePaymentSchema);
