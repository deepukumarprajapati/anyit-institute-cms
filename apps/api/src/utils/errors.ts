import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { fail } from '../utils/response';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  if (err instanceof ZodError) {
    return fail(res, 400, 'VALIDATION_ERROR', 'Validation failed', err.flatten());
  }
  console.error('[error]', err);
  return fail(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}
