export const PERMISSIONS = [
  'dashboard.view',
  'institute.view',
  'institute.update',
  'campuses.manage',
  'sessions.manage',
  'classes.manage',
  'subjects.manage',
  'roles.manage',
  'users.manage',
  'students.view',
  'students.create',
  'students.update',
  'students.delete',
  'staff.view',
  'staff.create',
  'staff.update',
  'staff.delete',
  'attendance.view',
  'attendance.mark',
  'holidays.manage',
  'fees.view',
  'fees.manage',
  'fees.collect',
  'salary.view',
  'salary.manage',
  'salary.run',
  'transport.view',
  'transport.manage',
  'events.view',
  'events.manage',
  'audit.view',
  'uploads.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLE_KEYS = [
  'super_admin',
  'admin',
  'principal',
  'teacher',
  'accountant',
  'receptionist',
] as const;

export type DefaultRoleKey = (typeof DEFAULT_ROLE_KEYS)[number];

export const ROLE_PERMISSION_MAP: Record<DefaultRoleKey, Permission[] | '*'> = {
  super_admin: '*',
  admin: [
    'dashboard.view',
    'institute.view',
    'institute.update',
    'campuses.manage',
    'sessions.manage',
    'classes.manage',
    'subjects.manage',
    'roles.manage',
    'users.manage',
    'students.view',
    'students.create',
    'students.update',
    'students.delete',
    'staff.view',
    'staff.create',
    'staff.update',
    'staff.delete',
    'attendance.view',
    'attendance.mark',
    'holidays.manage',
    'fees.view',
    'fees.manage',
    'fees.collect',
    'salary.view',
    'salary.manage',
    'salary.run',
    'transport.view',
    'transport.manage',
    'events.view',
    'events.manage',
    'audit.view',
    'uploads.manage',
  ],
  principal: [
    'dashboard.view',
    'institute.view',
    'campuses.manage',
    'sessions.manage',
    'classes.manage',
    'subjects.manage',
    'students.view',
    'students.create',
    'students.update',
    'staff.view',
    'staff.create',
    'staff.update',
    'attendance.view',
    'attendance.mark',
    'holidays.manage',
    'fees.view',
    'salary.view',
    'transport.view',
    'events.view',
    'events.manage',
    'audit.view',
  ],
  teacher: [
    'dashboard.view',
    'students.view',
    'attendance.view',
    'attendance.mark',
    'events.view',
  ],
  accountant: [
    'dashboard.view',
    'students.view',
    'staff.view',
    'fees.view',
    'fees.manage',
    'fees.collect',
    'salary.view',
    'salary.manage',
    'salary.run',
  ],
  receptionist: [
    'dashboard.view',
    'students.view',
    'students.create',
    'students.update',
    'staff.view',
    'attendance.view',
    'events.view',
    'transport.view',
  ],
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type StudentStatus = 'active' | 'alumni' | 'left' | 'suspended';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'excused';
export type FeeInvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'cancelled';
export type PayrollStatus = 'draft' | 'processed' | 'paid';

export const FEE_CATEGORIES = [
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
] as const;

export type FeeCategory = (typeof FEE_CATEGORIES)[number];

export const FEE_CATEGORY_LABELS: Record<FeeCategory, string> = {
  tuition: 'Tuition',
  transport: 'Transport',
  dress: 'Dress / Uniform',
  event: 'Event',
  lab: 'Lab',
  library: 'Library',
  hostel: 'Hostel',
  exam: 'Exam',
  annual: 'Annual',
  fine: 'Fine / Penalty',
  other: 'Other',
};

/** How a fee head applies to students */
export const FEE_APPLICABILITIES = ['class', 'transport', 'adhoc'] as const;
export type FeeApplicability = (typeof FEE_APPLICABILITIES)[number];

export const FEE_APPLICABILITY_LABELS: Record<FeeApplicability, string> = {
  class: 'Selected classes (fixed amount)',
  transport: 'Per student via transport distance',
  adhoc: 'One-off / per student (fine, special)',
};
