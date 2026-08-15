import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { env } from '../config/env';
import { Event } from '../models/Event';
import { EventParticipation } from '../models/StudentProfile';
import { AcademicSession } from '../models/AcademicSession';
import { Student } from '../models/Student';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';
import { notify } from '../services/notifications';

export const eventsRouter = Router();
eventsRouter.use(authenticate);

const uploadRoot = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const eventPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `event-${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});


async function resolveSessionId(instituteId: string | Types.ObjectId, at: Date) {
  const covering = await AcademicSession.findOne({
    instituteId,
    deletedAt: null,
    startDate: { $lte: at },
    endDate: { $gte: at },
  }).lean();
  if (covering) return covering._id;
  const active = await AcademicSession.findOne({ instituteId, deletedAt: null, isActive: true }).lean();
  return active?._id;
}

eventsRouter.get(
  '/',
  requirePermission('events.view'),
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === 'string' ? new Date(req.query.to) : undefined;
    const filter: Record<string, unknown> = { ...instituteFilter(req) };
    if (from || to) {
      filter.startAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    const items = await Event.find(filter).sort('startAt');
    return ok(res, items);
  })
);

eventsRouter.post(
  '/',
  requirePermission('events.manage'),
  audit('event', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(1),
        description: z.string().optional(),
        location: z.string().optional(),
        startAt: z.string(),
        endAt: z.string(),
        audience: z.enum(['all', 'students', 'staff', 'parents']).optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await Event.create({
      ...body,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    void notify({
      channel: 'email',
      to: 'all@institute.local',
      subject: `New event: ${item.title}`,
      body: `${item.title} from ${item.startAt.toISOString()} to ${item.endAt.toISOString()}`,
    }).catch(() => undefined);
    return ok(res, item, undefined, 201);
  })
);

eventsRouter.get(
  '/:id',
  requirePermission('events.view'),
  asyncHandler(async (req, res) => {
    const item = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    return ok(res, item);
  })
);

eventsRouter.get(
  '/:id/participants',
  requirePermission('events.view'),
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) }).lean();
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const items = await EventParticipation.find({
      ...instituteFilter(req),
      eventId: event._id,
    })
      .populate('studentId', 'firstName lastName admissionNo photoUrl status')
      .sort('createdAt')
      .lean();

    return ok(res, items);
  })
);

eventsRouter.post(
  '/:id/participants',
  requirePermission('events.manage'),
  audit('event', 'add_participants'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        studentIds: z.array(z.string().min(1)).min(1),
        role: z.enum(['participant', 'volunteer', 'winner', 'audience', 'organizer']).optional(),
        attendance: z.enum(['present', 'absent', 'late']).optional(),
        result: z.string().optional(),
        remarks: z.string().optional(),
      })
      .parse(req.body);

    const event = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const uniqueIds = [...new Set(body.studentIds)];
    const students = await Student.find({
      _id: { $in: uniqueIds },
      ...instituteFilter(req),
    }).lean();
    if (students.length !== uniqueIds.length) {
      throw new AppError(400, 'INVALID_STUDENTS', 'One or more students were not found');
    }

    const sessionId = await resolveSessionId(req.user!.instituteId, event.startAt);
    const role = body.role ?? 'participant';
    const attendance = body.attendance ?? 'present';
    const created: unknown[] = [];

    for (const student of students) {
      const item = await EventParticipation.findOneAndUpdate(
        {
          instituteId: req.user!.instituteId,
          eventId: event._id,
          studentId: student._id,
        },
        {
          $set: {
            eventTitle: event.title,
            eventDate: event.startAt,
            sessionId,
            role,
            attendance,
            deletedAt: null,
            ...(body.result !== undefined ? { result: body.result } : {}),
            ...(body.remarks !== undefined ? { remarks: body.remarks } : {}),
            ...actorFields(req),
          },
          $setOnInsert: {
            instituteId: req.user!.instituteId,
            eventId: event._id,
            studentId: student._id,
            createdBy: req.user!.id,
          },
        },
        { upsert: true, new: true }
      )
        .populate('studentId', 'firstName lastName admissionNo photoUrl status')
        .lean();
      created.push(item);
    }

    return ok(res, created, undefined, 201);
  })
);

eventsRouter.patch(
  '/:id/participants/:participationId',
  requirePermission('events.manage'),
  audit('event', 'update_participant'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        role: z.enum(['participant', 'volunteer', 'winner', 'audience', 'organizer']).optional(),
        attendance: z.enum(['present', 'absent', 'late']).optional(),
        result: z.string().optional(),
        remarks: z.string().optional(),
      })
      .parse(req.body);

    const event = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) }).lean();
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const item = await EventParticipation.findOneAndUpdate(
      {
        _id: req.params.participationId,
        eventId: event._id,
        ...instituteFilter(req),
      },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    ).populate('studentId', 'firstName lastName admissionNo photoUrl status');

    if (!item) throw new AppError(404, 'NOT_FOUND', 'Participant not found');
    return ok(res, item);
  })
);

eventsRouter.delete(
  '/:id/participants/:participationId',
  requirePermission('events.manage'),
  audit('event', 'remove_participant'),
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) }).lean();
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const item = await EventParticipation.findOneAndUpdate(
      {
        _id: req.params.participationId,
        eventId: event._id,
        ...instituteFilter(req),
      },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Participant not found');
    return ok(res, item);
  })
);

eventsRouter.post(
  '/:id/photos',
  requirePermission('events.manage'),
  audit('event', 'add_photos'),
  eventPhotoUpload.array('files', 20),
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const body = z
      .object({
        urls: z.array(z.string().min(1)).optional(),
        caption: z.string().optional(),
      })
      .parse(req.body ?? {});

    const caption = body.caption?.trim() || undefined;
    const now = new Date();
    const fromFiles = files.map((f) => ({
      url: `/uploads/${f.filename}`,
      caption,
      uploadedAt: now,
    }));
    const fromUrls = (body.urls ?? []).map((url) => ({
      url,
      caption,
      uploadedAt: now,
    }));
    const added = [...fromFiles, ...fromUrls];
    if (!added.length) {
      throw new AppError(400, 'NO_FILES', 'Upload at least one image');
    }

    event.photos.push(...added);
    Object.assign(event, actorFields(req));
    await event.save();
    return ok(res, event.photos, undefined, 201);
  })
);

eventsRouter.delete(
  '/:id/photos/:photoId',
  requirePermission('events.manage'),
  audit('event', 'remove_photo'),
  asyncHandler(async (req, res) => {
    const event = await Event.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!event) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    const before = event.photos.length;
    event.photos = event.photos.filter((p) => String(p._id) !== String(req.params.photoId));
    if (event.photos.length === before) {
      throw new AppError(404, 'NOT_FOUND', 'Photo not found');
    }
    Object.assign(event, actorFields(req));
    await event.save();
    return ok(res, event.photos);
  })
);

eventsRouter.patch(
  '/:id',
  requirePermission('events.manage'),
  audit('event', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        startAt: z.string().optional(),
        endAt: z.string().optional(),
        audience: z.enum(['all', 'students', 'staff', 'parents']).optional(),
      })
      .parse(req.body);
    const item = await Event.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      {
        $set: {
          ...body,
          ...(body.startAt ? { startAt: new Date(body.startAt) } : {}),
          ...(body.endAt ? { endAt: new Date(body.endAt) } : {}),
          ...actorFields(req),
        },
      },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Event not found');

    // Keep denormalized fields in sync for student profile tabs
    if (body.title || body.startAt) {
      await EventParticipation.updateMany(
        { eventId: item._id, ...instituteFilter(req) },
        {
          $set: {
            ...(body.title ? { eventTitle: item.title } : {}),
            ...(body.startAt ? { eventDate: item.startAt } : {}),
            ...actorFields(req),
          },
        }
      );
    }

    return ok(res, item);
  })
);

eventsRouter.delete(
  '/:id',
  requirePermission('events.manage'),
  audit('event', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Event.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Event not found');
    await EventParticipation.updateMany(
      { eventId: item._id, deletedAt: null, instituteId: req.user!.instituteId },
      { $set: { deletedAt: new Date(), ...actorFields(req) } }
    );
    return ok(res, item);
  })
);
