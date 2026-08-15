import { Request } from 'express';
import { FilterQuery } from 'mongoose';
import { AppError } from '../utils/errors';

export function parsePagination(req: Request) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
  const skip = (page - 1) * limit;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : '-createdAt';
  return { page, limit, skip, q, sort };
}

export function instituteFilter(req: Request, opts?: { includeDeleted?: boolean }): FilterQuery<unknown> {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
  const includeDeleted =
    opts?.includeDeleted === true ||
    req.query.deleted === '1' ||
    req.query.deleted === 'true';
  return {
    instituteId: req.user.instituteId,
    ...(includeDeleted ? { deletedAt: { $ne: null } } : { deletedAt: null }),
  };
}

export function actorFields(req: Request, creating = false) {
  if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
  if (creating) {
    return { createdBy: req.user.id, updatedBy: req.user.id };
  }
  return { updatedBy: req.user.id };
}
