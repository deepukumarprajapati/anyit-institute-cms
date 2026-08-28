import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Student } from '../models/Student';
import { CampusTransfer } from '../models/CampusTransfer';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { instituteFilter } from '../utils/query';
import { ok } from '../utils/response';
import { applyCampusTransfer } from '../services/campusTransfer';

export function registerCampusTransferRoutes(router: Router) {
  router.get(
    '/:id/campus-transfers',
    requirePermission('students.view'),
    asyncHandler(async (req, res) => {
      const items = await CampusTransfer.find({
        studentId: req.params.id,
        ...instituteFilter(req),
      })
        .populate('fromCampusId', 'name code schoolCode isPrimary')
        .populate('toCampusId', 'name code schoolCode isPrimary')
        .sort('-createdAt');
      return ok(res, items);
    })
  );

  router.post(
    '/:id/campus-transfers',
    requirePermission('students.update'),
    audit('student', 'campus_transfer'),
    asyncHandler(async (req, res) => {
      const body = z
        .object({
          toCampusId: z.string().min(1),
          effectiveMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
          reason: z.string().max(80).optional(),
          notes: z.string().max(500).optional(),
        })
        .parse(req.body);
      const student = await Student.findOne({ _id: req.params.id, ...instituteFilter(req) });
      if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
      const result = await applyCampusTransfer({
        student,
        toCampusId: body.toCampusId,
        effectiveMonth: body.effectiveMonth,
        reason: body.reason,
        notes: body.notes,
        actorId: req.user!.id,
        instituteId: String(req.user!.instituteId),
      });
      return ok(res, result, undefined, 201);
    })
  );
}
