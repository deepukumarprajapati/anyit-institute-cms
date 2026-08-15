import { NextFunction, Request, Response } from 'express';
import { AuditLog } from '../models/AuditLog';

export function audit(resource: string, action?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (req.user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        void AuditLog.create({
          instituteId: req.user.instituteId,
          userId: req.user.id,
          action: action ?? req.method.toLowerCase(),
          resource,
          resourceId: req.params.id,
          method: req.method,
          path: req.originalUrl,
          ip: req.ip,
          meta: typeof body === 'object' && body && 'data' in (body as object)
            ? { id: (body as { data?: { _id?: string } }).data?._id }
            : undefined,
        }).catch((e) => console.error('[audit]', e));
      }
      return originalJson(body);
    }) as Response['json'];
    next();
  };
}
