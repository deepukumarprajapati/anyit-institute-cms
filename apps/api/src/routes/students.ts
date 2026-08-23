import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Enrollment, Student } from '../models/Student';
import { StudentTransport, StudentTransportLog } from '../models/Transport';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter, parsePagination } from '../utils/query';
import { ok, paginationMeta } from '../utils/response';
import { buildStudentProfile } from '../services/studentProfile';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

studentsRouter.get(
  '/',
  requirePermission('students.view'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip, q } = parsePagination(req);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const filter = {
      ...instituteFilter(req),
      ...(status ? { status } : {}),
      ...(q
        ? {
            $or: [
              { firstName: new RegExp(q, 'i') },
              { lastName: new RegExp(q, 'i') },
              { admissionNo: new RegExp(q, 'i') },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      Student.find(filter).skip(skip).limit(limit).sort('-createdAt'),
      Student.countDocuments(filter),
    ]);
    return ok(res, items, paginationMeta(page, limit, total));
  })
);

studentsRouter.get(
  '/export/csv',
  requirePermission('students.view'),
  asyncHandler(async (req, res) => {
    const students = await Student.find(instituteFilter(req)).sort('admissionNo').limit(5000);
    const header = 'admissionNo,firstName,lastName,status,phone,email\n';
    const rows = students
      .map((s) =>
        [s.admissionNo, s.firstName, s.lastName ?? '', s.status, s.phone ?? '', s.email ?? '']
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="students.csv"');
    res.send(header + rows);
  })
);

/** Class / section wise student directory for active session enrollments */
studentsRouter.get(
  '/directory',
  requirePermission('students.view'),
  asyncHandler(async (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const classId = typeof req.query.classId === 'string' ? req.query.classId : undefined;
    const sectionId = typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined;
    const { page, limit, skip, q } = parsePagination(req);

    const enrollFilter: Record<string, unknown> = {
      ...instituteFilter(req),
      status: 'active',
      ...(sessionId ? { sessionId } : {}),
      ...(classId ? { classId } : {}),
      ...(sectionId ? { sectionId } : {}),
    };

    let enrollments = await Enrollment.find(enrollFilter)
      .populate('studentId')
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate('sessionId', 'name')
      .sort('classId sectionId rollNo')
      .lean();

    if (q) {
      const re = new RegExp(q, 'i');
      enrollments = enrollments.filter((e) => {
        const s = e.studentId as {
          firstName?: string;
          lastName?: string;
          admissionNo?: string;
          deletedAt?: Date | null;
        } | null;
        if (!s || s.deletedAt) return false;
        return (
          re.test(s.firstName || '') ||
          re.test(s.lastName || '') ||
          re.test(s.admissionNo || '')
        );
      });
    } else {
      enrollments = enrollments.filter((e) => {
        const s = e.studentId as { deletedAt?: Date | null } | null;
        return s && !s.deletedAt;
      });
    }

    const total = enrollments.length;
    const pageItems = enrollments.slice(skip, skip + limit);

    const byClassMap = new Map<
      string,
      { classId: string; className: string; sections: Map<string, { sectionId: string; sectionName: string; count: number }>; count: number }
    >();

    for (const e of enrollments) {
      const cls = e.classId as { _id?: unknown; name?: string } | null;
      const sec = e.sectionId as { _id?: unknown; name?: string } | null;
      const cId = String(cls?._id || e.classId);
      const cName = cls?.name || 'Unknown';
      const sId = String(sec?._id || e.sectionId);
      const sName = sec?.name || '—';
      if (!byClassMap.has(cId)) {
        byClassMap.set(cId, { classId: cId, className: cName, sections: new Map(), count: 0 });
      }
      const entry = byClassMap.get(cId)!;
      entry.count += 1;
      if (!entry.sections.has(sId)) {
        entry.sections.set(sId, { sectionId: sId, sectionName: sName, count: 0 });
      }
      entry.sections.get(sId)!.count += 1;
    }

    const summary = Array.from(byClassMap.values())
      .map((c) => ({
        classId: c.classId,
        className: c.className,
        count: c.count,
        sections: Array.from(c.sections.values()).sort((a, b) =>
          a.sectionName.localeCompare(b.sectionName)
        ),
      }))
      .sort((a, b) => a.className.localeCompare(b.className));

    const rows = pageItems.map((e) => {
      const s = e.studentId as unknown as Record<string, unknown>;
      const cls = e.classId as unknown as { name?: string; code?: string; _id?: unknown } | null;
      const sec = e.sectionId as unknown as { name?: string; _id?: unknown } | null;
      const sess = e.sessionId as unknown as { name?: string; _id?: unknown } | null;
      return {
        enrollmentId: e._id,
        rollNo: e.rollNo,
        studentId: s?._id,
        admissionNo: s?.admissionNo,
        firstName: s?.firstName,
        lastName: s?.lastName,
        phone: s?.phone,
        email: s?.email,
        status: s?.status,
        className: cls?.name,
        classCode: cls?.code,
        sectionName: sec?.name,
        sessionName: sess?.name,
        classId: cls?._id || e.classId,
        sectionId: sec?._id || e.sectionId,
        sessionId: sess?._id || e.sessionId,
      };
    });

    return ok(res, { rows, summary, totalStudents: total }, paginationMeta(page, limit, total));
  })
);

studentsRouter.get(
  '/:id/profile',
  requirePermission('students.view'),
  asyncHandler(async (req, res) => {
    const profile = await buildStudentProfile(req, req.params.id);
    return ok(res, profile);
  })
);

studentsRouter.get(
  '/:id',
  requirePermission('students.view'),
  asyncHandler(async (req, res) => {
    const student = await Student.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
    const enrollments = await Enrollment.find({
      studentId: student._id,
      ...instituteFilter(req),
    })
      .populate('sessionId', 'name isActive startDate endDate')
      .populate('classId', 'name code')
      .populate('sectionId', 'name')
      .populate({
        path: 'classroomId',
        select: 'name code floorId',
        populate: { path: 'floorId', select: 'name code' },
      });
    enrollments.sort((a, b) => {
      const as = (a.sessionId as { startDate?: Date } | null)?.startDate?.getTime?.() || 0;
      const bs = (b.sessionId as { startDate?: Date } | null)?.startDate?.getTime?.() || 0;
      return bs - as;
    });
    return ok(res, { student, enrollments });
  })
);

studentsRouter.post(
  '/',
  requirePermission('students.create'),
  audit('student', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        admissionNo: z.string().min(1),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        dob: z.string().optional(),
        gender: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        address: z.string().optional(),
        campusId: z.string().optional(),
        photoUrl: z.string().optional(),
        status: z.enum(['active', 'alumni', 'left', 'suspended']).optional(),
        guardians: z
          .array(
            z.object({
              name: z.string(),
              relation: z.string(),
              phone: z.string().optional(),
              email: z.string().optional(),
              isPrimary: z.boolean().optional(),
            })
          )
          .optional(),
        documents: z
          .array(
            z.object({
              name: z.string(),
              url: z.string(),
              uploadedAt: z.union([z.string(), z.date()]).optional(),
            })
          )
          .optional(),
      })
      .parse(req.body);

    const student = await Student.create({
      ...body,
      email: body.email || undefined,
      dob: body.dob ? new Date(body.dob) : undefined,
      documents: body.documents || [],
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, student, undefined, 201);
  })
);

studentsRouter.patch(
  '/:id',
  requirePermission('students.update'),
  audit('student', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        admissionNo: z.string().optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        dob: z.string().optional(),
        gender: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        address: z.string().optional(),
        campusId: z.string().optional(),
        photoUrl: z.string().optional(),
        status: z.enum(['active', 'alumni', 'left', 'suspended']).optional(),
        guardians: z
          .array(
            z.object({
              name: z.string(),
              relation: z.string(),
              phone: z.string().optional(),
              email: z.string().optional(),
              isPrimary: z.boolean().optional(),
            })
          )
          .optional(),
        documents: z
          .array(
            z.object({
              name: z.string(),
              url: z.string(),
              uploadedAt: z.union([z.string(), z.date()]).optional(),
            })
          )
          .optional(),
      })
      .parse(req.body);

    const existing = await Student.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Student not found');
    const leaving =
      Boolean(body.status) &&
      ['left', 'alumni'].includes(body.status as string) &&
      existing.status === 'active';

    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      {
        $set: {
          ...body,
          ...(body.dob ? { dob: new Date(body.dob) } : {}),
          ...actorFields(req),
        },
      },
      { new: true }
    );
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
    if (leaving) {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await StudentTransport.updateMany(
        { instituteId: req.user!.instituteId, studentId: student._id, deletedAt: null },
        { $set: { deletedAt: new Date(), ...actorFields(req) } }
      );
      await StudentTransportLog.updateMany(
        {
          instituteId: req.user!.instituteId,
          studentId: student._id,
          deletedAt: null,
          $or: [{ dateTo: null }, { dateTo: '' }, { dateTo: { $exists: false } }],
        },
        { $set: { dateTo: today, changeType: 'left_school', ...actorFields(req) } }
      );
    }
    return ok(res, student);
  })
);

studentsRouter.delete(
  '/:id',
  requirePermission('students.delete'),
  audit('student', 'delete'),
  asyncHandler(async (req, res) => {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');
    return ok(res, student);
  })
);

studentsRouter.post(
  '/:id/restore',
  requirePermission('students.update', 'students.delete'),
  audit('student', 'restore'),
  asyncHandler(async (req, res) => {
    const student = await Student.findOneAndUpdate(
      {
        _id: req.params.id,
        instituteId: req.user!.instituteId,
        deletedAt: { $ne: null },
      },
      { $set: { deletedAt: null, ...actorFields(req) } },
      { new: true }
    );
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Deleted student not found');
    return ok(res, student);
  })
);

studentsRouter.post(
  '/:id/enrollments',
  requirePermission('students.update'),
  audit('enrollment', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        sessionId: z.string(),
        classId: z.string(),
        sectionId: z.string(),
        classroomId: z.string().optional(),
        rollNo: z.string().optional(),
      })
      .parse(req.body);
    const student = await Student.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!student) throw new AppError(404, 'NOT_FOUND', 'Student not found');

    // One enrollment document per academic session (year).
    // Updating class/section/roll/classroom only changes THAT session's row.
    // Previous years remain as separate history rows.
    const enrollment = await Enrollment.findOneAndUpdate(
      {
        instituteId: req.user!.instituteId,
        studentId: student._id,
        sessionId: body.sessionId,
        deletedAt: null,
      },
      {
        $set: {
          classId: body.classId,
          sectionId: body.sectionId,
          classroomId: body.classroomId,
          rollNo: body.rollNo,
          status: 'active',
          ...actorFields(req),
        },
        $setOnInsert: {
          instituteId: req.user!.instituteId,
          studentId: student._id,
          sessionId: body.sessionId,
          ...actorFields(req, true),
        },
      },
      { upsert: true, new: true }
    );

    // When placing into a session, mark other years as completed (keeps history, closes old active)
    await Enrollment.updateMany(
      {
        instituteId: req.user!.instituteId,
        studentId: student._id,
        _id: { $ne: enrollment!._id },
        status: 'active',
        deletedAt: null,
      },
      { $set: { status: 'completed', ...actorFields(req) } }
    );

    return ok(res, enrollment, undefined, 201);
  })
);
