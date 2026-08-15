import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Staff } from '../models/Staff';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter, parsePagination } from '../utils/query';
import { ok, paginationMeta } from '../utils/response';

export const staffRouter = Router();
staffRouter.use(authenticate);

staffRouter.get(
  '/',
  requirePermission('staff.view'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, q } = parsePagination(req);
    const filter = {
      ...instituteFilter(req),
      ...(q
        ? {
            $or: [
              { firstName: new RegExp(q, 'i') },
              { lastName: new RegExp(q, 'i') },
              { employeeCode: new RegExp(q, 'i') },
              { department: new RegExp(q, 'i') },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      Staff.find(filter).skip(skip).limit(limit).sort('-createdAt'),
      Staff.countDocuments(filter),
    ]);
    return ok(res, items, paginationMeta(page, limit, total));
  })
);

staffRouter.get(
  '/:id',
  requirePermission('staff.view'),
  asyncHandler(async (req, res) => {
    const staff = await Staff.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!staff) throw new AppError(404, 'NOT_FOUND', 'Staff not found');
    return ok(res, staff);
  })
);

staffRouter.post(
  '/',
  requirePermission('staff.create'),
  audit('staff', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        employeeCode: z.string().min(1),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        department: z.string().optional(),
        designation: z.string().optional(),
        joiningDate: z.string().optional(),
        campusId: z.string().optional(),
        userId: z.string().optional(),
        status: z.enum(['active', 'inactive', 'resigned']).optional(),
      })
      .parse(req.body);

    const staff = await Staff.create({
      ...body,
      joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, staff, undefined, 201);
  })
);

staffRouter.patch(
  '/:id',
  requirePermission('staff.update'),
  audit('staff', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        employeeCode: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        department: z.string().optional(),
        designation: z.string().optional(),
        joiningDate: z.string().optional(),
        userId: z.string().optional(),
        status: z.enum(['active', 'inactive', 'resigned']).optional(),
      })
      .parse(req.body);

    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      {
        $set: {
          ...body,
          ...(body.joiningDate ? { joiningDate: new Date(body.joiningDate) } : {}),
          ...actorFields(req),
        },
      },
      { new: true }
    );
    if (!staff) throw new AppError(404, 'NOT_FOUND', 'Staff not found');
    return ok(res, staff);
  })
);

staffRouter.delete(
  '/:id',
  requirePermission('staff.delete'),
  audit('staff', 'delete'),
  asyncHandler(async (req, res) => {
    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!staff) throw new AppError(404, 'NOT_FOUND', 'Staff not found');
    return ok(res, staff);
  })
);

staffRouter.post(
  '/:id/restore',
  requirePermission('staff.update', 'staff.delete'),
  audit('staff', 'restore'),
  asyncHandler(async (req, res) => {
    const staff = await Staff.findOneAndUpdate(
      {
        _id: req.params.id,
        instituteId: req.user!.instituteId,
        deletedAt: { $ne: null },
      },
      { $set: { deletedAt: null, ...actorFields(req) } },
      { new: true }
    );
    if (!staff) throw new AppError(404, 'NOT_FOUND', 'Deleted staff not found');
    return ok(res, staff);
  })
);
