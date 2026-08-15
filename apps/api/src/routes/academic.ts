import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { AcademicSession } from '../models/AcademicSession';
import { SchoolClass, Section, Subject, Floor, Classroom } from '../models/Academic';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

sessionsRouter.get(
  '/',
  requirePermission('sessions.manage', 'dashboard.view'),
  asyncHandler(async (req, res) => {
    const items = await AcademicSession.find(instituteFilter(req)).sort('-startDate');
    return ok(res, items);
  })
);

sessionsRouter.post(
  '/',
  requirePermission('sessions.manage'),
  audit('session', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        startDate: z.string(),
        endDate: z.string(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    if (body.isActive) {
      await AcademicSession.updateMany(instituteFilter(req), { $set: { isActive: false } });
    }
    const item = await AcademicSession.create({
      name: body.name,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      isActive: body.isActive ?? false,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

sessionsRouter.patch(
  '/:id',
  requirePermission('sessions.manage'),
  audit('session', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    if (body.isActive) {
      await AcademicSession.updateMany(instituteFilter(req), { $set: { isActive: false } });
    }
    const item = await AcademicSession.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      {
        $set: {
          ...body,
          ...(body.startDate ? { startDate: new Date(body.startDate) } : {}),
          ...(body.endDate ? { endDate: new Date(body.endDate) } : {}),
          ...actorFields(req),
        },
      },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Session not found');
    return ok(res, item);
  })
);

export const classesRouter = Router();
classesRouter.use(authenticate);

classesRouter.get(
  '/',
  requirePermission('classes.manage', 'students.view', 'attendance.view'),
  asyncHandler(async (req, res) => {
    const items = await SchoolClass.find(instituteFilter(req)).sort('order name');
    return ok(res, items);
  })
);

classesRouter.post(
  '/',
  requirePermission('classes.manage'),
  audit('class', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        order: z.number().optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await SchoolClass.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

classesRouter.patch(
  '/:id',
  requirePermission('classes.manage'),
  audit('class', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        code: z.string().optional(),
        order: z.number().optional(),
      })
      .parse(req.body);
    const item = await SchoolClass.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Class not found');
    return ok(res, item);
  })
);

classesRouter.delete(
  '/:id',
  requirePermission('classes.manage'),
  audit('class', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await SchoolClass.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Class not found');
    return ok(res, item);
  })
);

export const sectionsRouter = Router();
sectionsRouter.use(authenticate);

sectionsRouter.get(
  '/',
  requirePermission('classes.manage', 'students.view', 'attendance.view'),
  asyncHandler(async (req, res) => {
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const items = await Section.find({
      ...instituteFilter(req),
      ...(classId ? { classId } : {}),
    })
      .populate('classroomId', 'name code floorId capacity')
      .sort('name');
    return ok(res, items);
  })
);

sectionsRouter.post(
  '/',
  requirePermission('classes.manage'),
  audit('section', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        classId: z.string(),
        name: z.string().min(1),
        capacity: z.number().optional(),
        classroomId: z.string().optional(),
      })
      .parse(req.body);
    const cls = await SchoolClass.findOne({ _id: body.classId, ...instituteFilter(req) });
    if (!cls) throw new AppError(400, 'INVALID_CLASS', 'Class not found');
    if (body.classroomId) {
      const room = await Classroom.findOne({ _id: body.classroomId, ...instituteFilter(req) });
      if (!room) throw new AppError(400, 'INVALID_CLASSROOM', 'Classroom not found');
    }
    const item = await Section.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

sectionsRouter.patch(
  '/:id',
  requirePermission('classes.manage'),
  audit('section', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        capacity: z.number().optional(),
        classroomId: z.string().nullable().optional(),
      })
      .parse(req.body);
    const { classroomId, ...rest } = body;
    const update: Record<string, unknown> = {
      $set: { ...rest, ...actorFields(req) },
    };
    if (classroomId === null) {
      update.$unset = { classroomId: 1 };
    } else if (classroomId) {
      (update.$set as Record<string, unknown>).classroomId = classroomId;
    }
    const item = await Section.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      update,
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Section not found');
    return ok(res, item);
  })
);

sectionsRouter.delete(
  '/:id',
  requirePermission('classes.manage'),
  audit('section', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Section.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Section not found');
    return ok(res, item);
  })
);

export const floorsRouter = Router();
floorsRouter.use(authenticate);

floorsRouter.get(
  '/',
  requirePermission('classes.manage', 'students.view', 'attendance.view'),
  asyncHandler(async (req, res) => {
    const items = await Floor.find(instituteFilter(req)).sort('level name');
    return ok(res, items);
  })
);

floorsRouter.post(
  '/',
  requirePermission('classes.manage'),
  audit('floor', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().min(1),
        level: z.number().optional(),
        building: z.string().optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await Floor.create({
      ...body,
      level: body.level ?? 0,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

floorsRouter.patch(
  '/:id',
  requirePermission('classes.manage'),
  audit('floor', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        code: z.string().optional(),
        level: z.number().optional(),
        building: z.string().optional(),
      })
      .parse(req.body);
    const item = await Floor.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Floor not found');
    return ok(res, item);
  })
);

floorsRouter.delete(
  '/:id',
  requirePermission('classes.manage'),
  audit('floor', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Floor.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Floor not found');
    return ok(res, item);
  })
);

export const classroomsRouter = Router();
classroomsRouter.use(authenticate);

classroomsRouter.get(
  '/',
  requirePermission('classes.manage', 'students.view', 'attendance.view'),
  asyncHandler(async (req, res) => {
    const floorId = typeof req.query.floorId === 'string' ? req.query.floorId : undefined;
    const items = await Classroom.find({
      ...instituteFilter(req),
      ...(floorId ? { floorId } : {}),
    })
      .populate('floorId', 'name code level building')
      .sort('code name');
    return ok(res, items);
  })
);

classroomsRouter.post(
  '/',
  requirePermission('classes.manage'),
  audit('classroom', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        floorId: z.string(),
        name: z.string().min(1),
        code: z.string().min(1),
        capacity: z.number().optional(),
        roomType: z.enum(['classroom', 'lab', 'library', 'office', 'other']).optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const floor = await Floor.findOne({ _id: body.floorId, ...instituteFilter(req) });
    if (!floor) throw new AppError(400, 'INVALID_FLOOR', 'Floor not found');
    const item = await Classroom.create({
      ...body,
      campusId: body.campusId || floor.campusId,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

classroomsRouter.patch(
  '/:id',
  requirePermission('classes.manage'),
  audit('classroom', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        floorId: z.string().optional(),
        name: z.string().optional(),
        code: z.string().optional(),
        capacity: z.number().optional(),
        roomType: z.enum(['classroom', 'lab', 'library', 'office', 'other']).optional(),
      })
      .parse(req.body);
    const item = await Classroom.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Classroom not found');
    return ok(res, item);
  })
);

classroomsRouter.delete(
  '/:id',
  requirePermission('classes.manage'),
  audit('classroom', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Classroom.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Classroom not found');
    return ok(res, item);
  })
);

export const subjectsRouter = Router();
subjectsRouter.use(authenticate);

subjectsRouter.get(
  '/',
  requirePermission('subjects.manage', 'classes.manage'),
  asyncHandler(async (req, res) => {
    const items = await Subject.find(instituteFilter(req)).sort('name');
    return ok(res, items);
  })
);

subjectsRouter.post(
  '/',
  requirePermission('subjects.manage'),
  audit('subject', 'create'),
  asyncHandler(async (req, res) => {
    const body = z.object({ name: z.string().min(1), code: z.string().min(1) }).parse(req.body);
    const item = await Subject.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

subjectsRouter.delete(
  '/:id',
  requirePermission('subjects.manage'),
  audit('subject', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Subject.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Subject not found');
    return ok(res, item);
  })
);
