import { Router } from 'express';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Campus } from '../models/Campus';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';
import { campusDetailsSchema, campusUpdateSchema, stripHeadOfficeOnlyFields } from '../utils/campusFields';

export const campusesRouter = Router();
campusesRouter.use(authenticate);

campusesRouter.get(
  '/',
  requirePermission('campuses.manage', 'institute.view', 'dashboard.view'),
  asyncHandler(async (req, res) => {
    const items = await Campus.find(instituteFilter(req)).sort('name');
    return ok(res, items);
  })
);

campusesRouter.post(
  '/',
  requirePermission('campuses.manage'),
  audit('campus', 'create'),
  asyncHandler(async (req, res) => {
    const body = campusDetailsSchema.parse(req.body);
    const isPrimary = Boolean(body.isPrimary);
    if (isPrimary && body.schoolCode) {
      throw new AppError(400, 'INVALID_FIELD', 'School code is only for campuses / branches, not head office');
    }
    if (isPrimary) {
      await Campus.updateMany(instituteFilter(req), { $set: { isPrimary: false } });
    }
    const campus = await Campus.create({
      ...stripHeadOfficeOnlyFields(body, isPrimary),
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, campus, undefined, 201);
  })
);

campusesRouter.patch(
  '/:id',
  requirePermission('campuses.manage'),
  audit('campus', 'update'),
  asyncHandler(async (req, res) => {
    const body = campusUpdateSchema.parse(req.body);
    const existing = await Campus.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Campus not found');
    const isPrimary = body.isPrimary ?? existing.isPrimary;
    if (isPrimary && body.schoolCode) {
      throw new AppError(400, 'INVALID_FIELD', 'School code is only for campuses / branches, not head office');
    }
    if (body.isPrimary) {
      await Campus.updateMany(instituteFilter(req), { $set: { isPrimary: false } });
    }
    const next = stripHeadOfficeOnlyFields(body, isPrimary);
    const { schoolCode, ...rest } = next;
    const update: Record<string, unknown> = {
      $set: {
        ...rest,
        ...actorFields(req),
      },
    };
    const unset: Record<string, number> = {};
    if (isPrimary) {
      unset.schoolCode = 1;
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'schoolCode')) {
      if (schoolCode) {
        (update.$set as Record<string, unknown>).schoolCode = schoolCode;
      } else {
        unset.schoolCode = 1;
      }
    }
    if (Object.keys(unset).length) update.$unset = unset;
    const campus = await Campus.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      update,
      { new: true }
    );
    if (!campus) throw new AppError(404, 'NOT_FOUND', 'Campus not found');
    return ok(res, campus);
  })
);

campusesRouter.delete(
  '/:id',
  requirePermission('campuses.manage'),
  audit('campus', 'delete'),
  asyncHandler(async (req, res) => {
    const campus = await Campus.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!campus) throw new AppError(404, 'NOT_FOUND', 'Campus not found');
    return ok(res, campus);
  })
);
