export type CampusRef = {
  _id?: string;
  name?: string;
  code?: string;
  schoolCode?: string;
  isPrimary?: boolean;
};

export type CampusRecord = {
  _id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  pincode?: string;
  schoolCode?: string;
  mapUrl?: string;
  latitude?: number;
  longitude?: number;
  imageUrl?: string;
  isPrimary: boolean;
};

export type CampusHistoryRow = {
  campusId?: CampusRef | string;
  fromMonth?: string;
  toMonth?: string | null;
  reason?: string;
  notes?: string;
  transferredAt?: string;
};

export type BranchDashboardRow = {
  campusId: string;
  name: string;
  code: string;
  schoolCode?: string;
  isPrimary: boolean;
  students: number;
  staff: number;
  pending: number;
  received: number;
  billed: number;
  attendancePct: number;
};

export function campusDisplayName(campus: unknown): string {
  if (campus && typeof campus === 'object') {
    const c = campus as CampusRef;
    return c.name || c.code || '—';
  }
  return '—';
}

export const TRANSFER_REASON_OPTIONS = [
  { label: 'Parent relocated', value: 'parent_relocation' },
  { label: 'Requested by family', value: 'family_request' },
  { label: 'Academic / admin', value: 'admin' },
  { label: 'Other', value: 'other' },
];
