import { Types } from 'mongoose';
import { Request } from 'express';
import { Student, IStudent } from '../models/Student';
import { instituteFilter } from './query';

export function currentMonthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function parseCampusId(req: Request): string | undefined {
  const raw = typeof req.query.campusId === 'string' ? req.query.campusId.trim() : '';
  if (!raw || raw === 'all') return undefined;
  if (!Types.ObjectId.isValid(raw)) return undefined;
  return raw;
}

export function campusIdForMonth(
  student: Pick<IStudent, 'campusId' | 'campusHistory'>,
  month: string
): string | undefined {
  const history = student.campusHistory || [];
  const hit = history.find(
    (row) => row.fromMonth <= month && (!row.toMonth || row.toMonth > month)
  );
  if (hit?.campusId) return String(hit.campusId);
  return student.campusId ? String(student.campusId) : undefined;
}

export async function studentIdsForCampus(req: Request, campusId?: string) {
  if (!campusId) return undefined;
  const ids = await Student.find({
    ...instituteFilter(req),
    campusId,
    status: 'active',
  }).distinct('_id');
  return ids.map((id) => String(id));
}
