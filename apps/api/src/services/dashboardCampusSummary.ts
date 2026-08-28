export type CampusDashboardRow = {
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

type CampusDoc = {
  _id: unknown;
  name: string;
  code: string;
  schoolCode?: string;
  isPrimary?: boolean;
};

type CountDoc = { campusId?: unknown };
type InvoiceDoc = {
  studentId: unknown;
  status: string;
  totalAmount?: number;
  paidAmount?: number;
};
type AttendanceDoc = { studentId: unknown; status: string };

export function buildCampusDashboardRows(opts: {
  campuses: CampusDoc[];
  studentDocs: CountDoc[];
  staffDocs: CountDoc[];
  invoices: InvoiceDoc[];
  attendanceRows: AttendanceDoc[];
  campusOfStudent: Map<string, string>;
  money: (n: number) => number;
}): CampusDashboardRow[] {
  type Acc = CampusDashboardRow & { attTotal: number; attPresent: number };
  const byCampusMap = new Map<string, Acc>();

  for (const c of opts.campuses) {
    byCampusMap.set(String(c._id), {
      campusId: String(c._id),
      name: c.name,
      code: c.code,
      schoolCode: c.schoolCode,
      isPrimary: Boolean(c.isPrimary),
      students: 0,
      staff: 0,
      pending: 0,
      received: 0,
      billed: 0,
      attendancePct: 0,
      attTotal: 0,
      attPresent: 0,
    });
  }

  byCampusMap.set('', {
    campusId: '',
    name: 'Unassigned',
    code: '—',
    isPrimary: false,
    students: 0,
    staff: 0,
    pending: 0,
    received: 0,
    billed: 0,
    attendancePct: 0,
    attTotal: 0,
    attPresent: 0,
  });

  for (const s of opts.studentDocs) {
    const row = byCampusMap.get(s.campusId ? String(s.campusId) : '');
    if (row) row.students += 1;
  }
  for (const s of opts.staffDocs) {
    const row = byCampusMap.get(s.campusId ? String(s.campusId) : '');
    if (row) row.staff += 1;
  }
  for (const inv of opts.invoices) {
    if (inv.status === 'cancelled' || inv.status === 'draft') continue;
    const row = byCampusMap.get(opts.campusOfStudent.get(String(inv.studentId)) || '');
    if (!row) continue;
    row.billed += inv.totalAmount || 0;
    row.received += inv.paidAmount || 0;
    if (inv.status === 'issued' || inv.status === 'partial') {
      row.pending += Math.max(0, (inv.totalAmount || 0) - (inv.paidAmount || 0));
    }
  }
  for (const r of opts.attendanceRows) {
    const row = byCampusMap.get(opts.campusOfStudent.get(String(r.studentId)) || '');
    if (!row) continue;
    row.attTotal += 1;
    if (['present', 'late', 'half_day'].includes(r.status)) row.attPresent += 1;
  }

  return [...byCampusMap.values()]
    .filter((r) => r.campusId || r.students || r.staff)
    .map((r) => ({
      campusId: r.campusId,
      name: r.name,
      code: r.code,
      schoolCode: r.schoolCode,
      isPrimary: r.isPrimary,
      students: r.students,
      staff: r.staff,
      pending: opts.money(r.pending),
      received: opts.money(r.received),
      billed: opts.money(r.billed),
      attendancePct: r.attTotal ? Math.round((r.attPresent / r.attTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
}
