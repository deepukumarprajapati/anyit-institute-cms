import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Holiday, StaffAttendance, StudentAttendance } from '../models/Attendance';
import { Enrollment } from '../models/Student';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.get(
  '/students',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const sectionId = z.string().parse(req.query.sectionId);
    const date = z.string().parse(req.query.date);
    const items = await StudentAttendance.find({
      ...instituteFilter(req),
      sectionId,
      date,
    }).populate('studentId', 'firstName lastName admissionNo');
    return ok(res, items);
  })
);

attendanceRouter.post(
  '/students/bulk',
  requirePermission('attendance.mark'),
  audit('student_attendance', 'bulk_mark'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        sessionId: z.string(),
        classId: z.string(),
        sectionId: z.string(),
        date: z.string(),
        records: z.array(
          z.object({
            studentId: z.string(),
            status: z.enum(['present', 'absent', 'late', 'half_day', 'excused']),
            remark: z.string().optional(),
          })
        ),
      })
      .parse(req.body);

    const results = [];
    for (const rec of body.records) {
      const item = await StudentAttendance.findOneAndUpdate(
        {
          instituteId: req.user!.instituteId,
          studentId: rec.studentId,
          date: body.date,
          deletedAt: null,
        },
        {
          $set: {
            sessionId: body.sessionId,
            classId: body.classId,
            sectionId: body.sectionId,
            status: rec.status,
            remark: rec.remark,
            ...actorFields(req),
          },
          $setOnInsert: {
            instituteId: req.user!.instituteId,
            studentId: rec.studentId,
            date: body.date,
            ...actorFields(req, true),
          },
        },
        { upsert: true, new: true }
      );
      results.push(item);
    }
    return ok(res, results);
  })
);

attendanceRouter.get(
  '/students/roster',
  requirePermission('attendance.view', 'attendance.mark'),
  asyncHandler(async (req, res) => {
    const sectionId = z.string().parse(req.query.sectionId);
    const sessionId = z.string().parse(req.query.sessionId);
    const enrollments = await Enrollment.find({
      ...instituteFilter(req),
      sectionId,
      sessionId,
      status: 'active',
    }).populate('studentId');
    return ok(
      res,
      enrollments.map((e) => ({ enrollment: e, student: e.studentId }))
    );
  })
);

attendanceRouter.get(
  '/students/report',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const studentId = z.string().parse(req.query.studentId);
    const from = z.string().parse(req.query.from);
    const to = z.string().parse(req.query.to);
    const items = await StudentAttendance.find({
      ...instituteFilter(req),
      studentId,
      date: { $gte: from, $lte: to },
    }).sort('date');
    const total = items.length;
    const present = items.filter((i) => ['present', 'late', 'half_day'].includes(i.status)).length;
    const percentage = total ? Math.round((present / total) * 1000) / 10 : 0;
    return ok(res, { items, summary: { total, present, percentage } });
  })
);

attendanceRouter.post(
  '/staff/bulk',
  requirePermission('attendance.mark'),
  audit('staff_attendance', 'bulk_mark'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        date: z.string(),
        records: z.array(
          z.object({
            staffId: z.string(),
            status: z.enum(['present', 'absent', 'late', 'half_day', 'excused']),
            remark: z.string().optional(),
          })
        ),
      })
      .parse(req.body);
    const results = [];
    for (const rec of body.records) {
      const item = await StaffAttendance.findOneAndUpdate(
        {
          instituteId: req.user!.instituteId,
          staffId: rec.staffId,
          date: body.date,
          deletedAt: null,
        },
        {
          $set: { status: rec.status, remark: rec.remark, ...actorFields(req) },
          $setOnInsert: {
            instituteId: req.user!.instituteId,
            staffId: rec.staffId,
            date: body.date,
            ...actorFields(req, true),
          },
        },
        { upsert: true, new: true }
      );
      results.push(item);
    }
    return ok(res, results);
  })
);

attendanceRouter.get(
  '/staff',
  requirePermission('attendance.view'),
  asyncHandler(async (req, res) => {
    const date = z.string().parse(req.query.date);
    const items = await StaffAttendance.find({ ...instituteFilter(req), date }).populate(
      'staffId',
      'firstName lastName employeeCode'
    );
    return ok(res, items);
  })
);

attendanceRouter.get(
  '/holidays',
  requirePermission('holidays.manage', 'attendance.view'),
  asyncHandler(async (req, res) => {
    const items = await Holiday.find(instituteFilter(req)).sort('date');
    return ok(res, items);
  })
);

attendanceRouter.post(
  '/holidays',
  requirePermission('holidays.manage'),
  audit('holiday', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        date: z.string(),
        type: z.enum(['holiday', 'optional', 'event_off']).optional(),
      })
      .parse(req.body);
    const item = await Holiday.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

attendanceRouter.delete(
  '/holidays/:id',
  requirePermission('holidays.manage'),
  audit('holiday', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Holiday.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Holiday not found');
    return ok(res, item);
  })
);
