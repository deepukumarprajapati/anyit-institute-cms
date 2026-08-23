import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Institute } from '../models/Institute';
import { Campus } from '../models/Campus';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter, parsePagination } from '../utils/query';
import { ok, paginationMeta } from '../utils/response';
import { notDeleted } from '../models/base';
import bcrypt from 'bcryptjs';
import { PERMISSIONS } from '@anyit/shared';

export const instituteRouter = Router();
instituteRouter.use(authenticate);

instituteRouter.get(
  '/',
  requirePermission('institute.view'),
  asyncHandler(async (req, res) => {
    const institute = await Institute.findOne({ _id: req.user!.instituteId, ...notDeleted() });
    if (!institute) throw new AppError(404, 'NOT_FOUND', 'Institute not found');
    return ok(res, institute);
  })
);

instituteRouter.patch(
  '/',
  requirePermission('institute.update'),
  audit('institute', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        logoUrl: z.string().optional(),
        loginBackgroundUrl: z.string().optional(),
        settings: z
          .object({
            timezone: z.string().optional(),
            currency: z.string().optional(),
            academicYearLabel: z.string().optional(),
          })
          .optional(),
      })
      .parse(req.body);

    const institute = await Institute.findOneAndUpdate(
      { _id: req.user!.instituteId, ...notDeleted() },
      { $set: { ...body, ...actorFields(req) }, $inc: { version: 1 } },
      { new: true }
    );
    if (!institute) throw new AppError(404, 'NOT_FOUND', 'Institute not found');
    return ok(res, institute);
  })
);

export const campusesRouter = Router();
campusesRouter.use(authenticate);

campusesRouter.get(
  '/',
  requirePermission('campuses.manage', 'institute.view'),
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
    const body = z
      .object({
        name: z.string().min(2),
        code: z.string().min(1),
        address: z.string().optional(),
        phone: z.string().optional(),
        isPrimary: z.boolean().optional(),
      })
      .parse(req.body);
    if (body.isPrimary) {
      await Campus.updateMany(instituteFilter(req), { $set: { isPrimary: false } });
    }
    const campus = await Campus.create({
      ...body,
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
    const body = z
      .object({
        name: z.string().min(2).optional(),
        code: z.string().min(1).optional(),
        address: z.string().optional(),
        phone: z.string().optional(),
        isPrimary: z.boolean().optional(),
      })
      .parse(req.body);
    if (body.isPrimary) {
      await Campus.updateMany(instituteFilter(req), { $set: { isPrimary: false } });
    }
    const campus = await Campus.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
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

export const rolesRouter = Router();
rolesRouter.use(authenticate);

rolesRouter.get(
  '/permissions',
  requirePermission('roles.manage'),
  asyncHandler(async (_req, res) => ok(res, PERMISSIONS))
);

rolesRouter.get(
  '/',
  requirePermission('roles.manage'),
  asyncHandler(async (req, res) => {
    const roles = await Role.find(instituteFilter(req)).sort('name');
    return ok(res, roles);
  })
);

rolesRouter.post(
  '/',
  requirePermission('roles.manage'),
  audit('role', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        key: z.string().min(2),
        name: z.string().min(2),
        description: z.string().optional(),
        permissions: z.array(z.string()),
      })
      .parse(req.body);
    const role = await Role.create({
      ...body,
      instituteId: req.user!.instituteId,
      isSystem: false,
      ...actorFields(req, true),
    });
    return ok(res, role, undefined, 201);
  })
);

rolesRouter.patch(
  '/:id',
  requirePermission('roles.manage'),
  audit('role', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const role = await Role.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    );
    if (!role) throw new AppError(404, 'NOT_FOUND', 'Role not found');
    return ok(res, role);
  })
);

export const usersRouter = Router();
usersRouter.use(authenticate);

usersRouter.get(
  '/',
  requirePermission('users.manage'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, q } = parsePagination(req);
    const filter = {
      ...instituteFilter(req),
      ...(q ? { $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] } : {}),
    };
    const [items, total] = await Promise.all([
      User.find(filter).select('-passwordHash -refreshTokenHash').populate('roleId', 'name key').skip(skip).limit(limit).sort('-createdAt'),
      User.countDocuments(filter),
    ]);
    return ok(res, items, paginationMeta(page, limit, total));
  })
);

usersRouter.post(
  '/',
  requirePermission('users.manage'),
  audit('user', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(8),
        roleId: z.string(),
        phone: z.string().optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const role = await Role.findOne({ _id: body.roleId, ...instituteFilter(req) });
    if (!role) throw new AppError(400, 'INVALID_ROLE', 'Role not found');
    const user = await User.create({
      name: body.name,
      email: body.email.toLowerCase(),
      passwordHash: await bcrypt.hash(body.password, 10),
      roleId: body.roleId,
      phone: body.phone,
      campusId: body.campusId,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    const safe = user.toObject();
    delete (safe as { passwordHash?: string }).passwordHash;
    return ok(res, safe, undefined, 201);
  })
);
