import { Response } from 'express';
import { PaginationMeta } from '@anyit/shared';

export function ok<T>(res: Response, data: T, meta?: PaginationMeta, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown) {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}

export function paginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
