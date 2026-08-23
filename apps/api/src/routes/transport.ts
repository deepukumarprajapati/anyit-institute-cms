import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import {
  StudentTransport,
  StudentTransportLog,
  TransportCrew,
  TransportDuty,
  TransportFeeTier,
  TransportRelief,
  TransportRoute,
  Vehicle,
} from '../models/Transport';
import { StudentAttendance } from '../models/Attendance';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';

export const transportRouter = Router();
transportRouter.use(authenticate);

const crewRoleSchema = z.enum(['driver', 'conductor']);

async function syncCrewVehicleAssignment(opts: {
  instituteId: string | Types.ObjectId;
  crewId: Types.ObjectId;
  role: 'driver' | 'conductor';
  name: string;
  phone?: string;
  vehicleId?: string | null;
  previousVehicleId?: string | null;
}) {
  const idField = opts.role === 'driver' ? 'driverId' : 'conductorId';
  const driverExtras =
    opts.role === 'driver' ? { driverName: opts.name, driverPhone: opts.phone || '' } : {};
  const driverClear = opts.role === 'driver' ? { driverName: '', driverPhone: '' } : {};
  const prev = opts.previousVehicleId || undefined;
  const next = opts.vehicleId || undefined;

  if (prev && prev !== next) {
    await Vehicle.updateOne(
      { _id: prev, instituteId: opts.instituteId, [idField]: opts.crewId },
      { $unset: { [idField]: 1 }, $set: driverClear }
    );
  }

  if (!next) return;

  await TransportCrew.updateMany(
    {
      instituteId: opts.instituteId,
      role: opts.role,
      vehicleId: next,
      _id: { $ne: opts.crewId },
      deletedAt: null,
    },
    { $unset: { vehicleId: 1 } }
  );

  await Vehicle.updateOne(
    { _id: next, instituteId: opts.instituteId },
    { $set: { [idField]: opts.crewId, ...driverExtras } }
  );
}

const vehicleTimingSchema = z.object({
  time: z.string().min(1),
  route: z.string().min(1),
  routeId: z.union([z.string().min(1), z.null()]).optional(),
});

function sanitizeTimings(timings?: { time: string; route: string; routeId?: string | null }[]) {
  if (!timings) return undefined;
  return timings.map((t) => ({
    time: t.time.trim(),
    route: t.route.trim(),
    ...(t.routeId ? { routeId: t.routeId } : {}),
  }));
}

transportRouter.get(
  '/vehicles',
  requirePermission('transport.view', 'transport.manage'),
  asyncHandler(async (req, res) => {
    const items = await Vehicle.find(instituteFilter(req))
      .populate('driverId', 'name phone photoUrl role')
      .populate('conductorId', 'name phone photoUrl role')
      .populate('timings.routeId', 'name')
      .sort('number');
    return ok(res, items);
  })
);

transportRouter.post(
  '/vehicles',
  requirePermission('transport.manage'),
  audit('vehicle', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        number: z.string().min(1),
        type: z.string().optional(),
        capacity: z.number().optional(),
        routeNumber: z.string().optional(),
        timings: z.array(vehicleTimingSchema).optional(),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await Vehicle.create({
      ...body,
      timings: sanitizeTimings(body.timings) ?? [],
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

transportRouter.patch(
  '/vehicles/:id',
  requirePermission('transport.manage'),
  audit('vehicle', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        number: z.string().min(1).optional(),
        type: z.string().optional(),
        capacity: z.number().optional(),
        routeNumber: z.string().optional(),
        timings: z.array(vehicleTimingSchema).optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      {
        $set: {
          ...body,
          ...(body.timings !== undefined ? { timings: sanitizeTimings(body.timings) ?? [] } : {}),
          ...actorFields(req),
        },
      },
      { new: true }
    )
      .populate('driverId', 'name phone photoUrl role')
      .populate('conductorId', 'name phone photoUrl role')
      .populate('timings.routeId', 'name');
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
    return ok(res, item);
  })
);

transportRouter.delete(
  '/vehicles/:id',
  requirePermission('transport.manage'),
  audit('vehicle', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');
    await Promise.all([
      TransportCrew.updateMany(
        { instituteId: req.user!.instituteId, vehicleId: item._id, deletedAt: null },
        { $unset: { vehicleId: 1 }, $set: actorFields(req) }
      ),
      TransportRoute.updateMany(
        { instituteId: req.user!.instituteId, vehicleId: item._id, deletedAt: null },
        { $unset: { vehicleId: 1 }, $set: actorFields(req) }
      ),
    ]);
    return ok(res, item);
  })
);

transportRouter.get(
  '/crew',
  requirePermission('transport.view', 'transport.manage'),
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const items = await TransportCrew.find({
      ...instituteFilter(req),
      ...(role === 'driver' || role === 'conductor' ? { role } : {}),
    })
      .populate('vehicleId', 'number routeNumber type')
      .sort('role name');
    return ok(res, items);
  })
);

transportRouter.post(
  '/crew',
  requirePermission('transport.manage'),
  audit('transport_crew', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        role: crewRoleSchema,
        name: z.string().min(1),
        phone: z.string().optional(),
        photoUrl: z.string().optional(),
        vehicleId: z.union([z.string(), z.null()]).optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await TransportCrew.create({
      ...body,
      vehicleId: body.vehicleId || undefined,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    await syncCrewVehicleAssignment({
      instituteId: req.user!.instituteId,
      crewId: item._id,
      role: item.role,
      name: item.name,
      phone: item.phone,
      vehicleId: body.vehicleId || null,
    });
    if (body.vehicleId) {
      await logCrewVehicleChange(req, { crew: item, vehicleId: body.vehicleId });
    }
    const populated = await TransportCrew.findById(item._id).populate('vehicleId', 'number routeNumber type');
    return ok(res, populated, undefined, 201);
  })
);

transportRouter.patch(
  '/crew/:id',
  requirePermission('transport.manage'),
  audit('transport_crew', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        role: crewRoleSchema.optional(),
        name: z.string().min(1).optional(),
        phone: z.string().optional(),
        photoUrl: z.string().optional(),
        vehicleId: z.union([z.string(), z.null()]).optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const existing = await TransportCrew.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Driver / conductor not found');

    const previousVehicleId = existing.vehicleId ? String(existing.vehicleId) : null;
    const previousRole = existing.role;
    const nextVehicleId =
      body.vehicleId === undefined
        ? previousVehicleId
        : body.vehicleId
          ? body.vehicleId
          : null;

    if (body.role) existing.role = body.role;
    if (body.name !== undefined) existing.name = body.name;
    if (body.phone !== undefined) existing.phone = body.phone;
    if (body.photoUrl !== undefined) existing.photoUrl = body.photoUrl;
    if (nextVehicleId) existing.vehicleId = new Types.ObjectId(nextVehicleId);
    else existing.set('vehicleId', undefined);
    Object.assign(existing, actorFields(req));
    await existing.save();
    if (!nextVehicleId) {
      await TransportCrew.updateOne({ _id: existing._id }, { $unset: { vehicleId: 1 } });
    }

    if (previousRole !== existing.role && previousVehicleId) {
      await syncCrewVehicleAssignment({
        instituteId: req.user!.instituteId,
        crewId: existing._id,
        role: previousRole,
        name: existing.name,
        phone: existing.phone,
        vehicleId: null,
        previousVehicleId,
      });
    }

    await syncCrewVehicleAssignment({
      instituteId: req.user!.instituteId,
      crewId: existing._id,
      role: existing.role,
      name: existing.name,
      phone: existing.phone,
      vehicleId: nextVehicleId,
      previousVehicleId: previousRole === existing.role ? previousVehicleId : null,
    });
    if (previousVehicleId && previousVehicleId !== nextVehicleId) {
      await closeOpenCrewDuties(req, {
        crewId: existing._id,
        role: existing.role,
        vehicleId: previousVehicleId,
      });
    }
    if (nextVehicleId && previousVehicleId !== nextVehicleId) {
      await logCrewVehicleChange(req, { crew: existing, vehicleId: nextVehicleId });
    }

    const populated = await TransportCrew.findById(existing._id).populate('vehicleId', 'number routeNumber type');
    return ok(res, populated);
  })
);

transportRouter.delete(
  '/crew/:id',
  requirePermission('transport.manage'),
  audit('transport_crew', 'delete'),
  asyncHandler(async (req, res) => {
    const existing = await TransportCrew.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Driver / conductor not found');
    const previousVehicleId = existing.vehicleId ? String(existing.vehicleId) : null;
    const item = await TransportCrew.findOneAndUpdate(
      { _id: existing._id },
      { $set: { deletedAt: new Date(), ...actorFields(req) }, $unset: { vehicleId: 1 } },
      { new: true }
    );
    await syncCrewVehicleAssignment({
      instituteId: req.user!.instituteId,
      crewId: existing._id,
      role: existing.role,
      name: existing.name,
      phone: existing.phone,
      vehicleId: null,
      previousVehicleId,
    });
    return ok(res, item);
  })
);

const ymdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

function todayYmd() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function shiftYmd(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dutyCoversToday(dateFrom: string, dateTo?: string | null) {
  const today = todayYmd();
  return dateFrom <= today && (!dateTo || dateTo >= today);
}

function populateDuty(query: any) {
  return query
    .populate('vehicleId', 'number routeNumber type')
    .populate('driverId', 'name phone photoUrl role')
    .populate('conductorId', 'name phone photoUrl role')
    .populate('routeId', 'name');
}

async function attachReliefs(duties: Array<{ _id: unknown; toObject?: () => Record<string, unknown> }>) {
  if (!duties.length) return [];
  const ids = duties.map((d) => d._id);
  const reliefs = await TransportRelief.find({ dutyId: { $in: ids }, deletedAt: null })
    .populate('originalId', 'name phone photoUrl role')
    .populate('reliefId', 'name phone photoUrl role')
    .sort({ dateFrom: -1, createdAt: -1 });
  const byDuty = new Map<string, typeof reliefs>();
  for (const r of reliefs) {
    const key = String(r.dutyId);
    const list = byDuty.get(key) || [];
    list.push(r);
    byDuty.set(key, list);
  }
  return duties.map((d) => {
    const obj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
    obj.reliefs = byDuty.get(String(d._id)) || [];
    return obj;
  });
}

const dutyBodySchema = z.object({
  dateFrom: ymdSchema,
  dateTo: ymdSchema.optional().or(z.literal('')),
  vehicleId: z.string().min(1),
  route: z.string().min(1),
  routeId: z.union([z.string().min(1), z.null()]).optional(),
  time: z.string().optional(),
  driverId: z.union([z.string().min(1), z.null()]).optional(),
  conductorId: z.union([z.string().min(1), z.null()]).optional(),
  notes: z.string().optional(),
});

function dutyFields(body: z.infer<typeof dutyBodySchema>) {
  return {
    dateFrom: body.dateFrom,
    dateTo: body.dateTo || undefined,
    vehicleId: body.vehicleId,
    route: body.route.trim(),
    routeId: body.routeId || undefined,
    time: body.time || undefined,
    driverId: body.driverId || undefined,
    conductorId: body.conductorId || undefined,
    notes: body.notes || undefined,
  };
}

async function applyDutySnapshot(
  req: Parameters<typeof instituteFilter>[0],
  duty: { dateFrom: string; dateTo?: string | null; vehicleId: Types.ObjectId | string; driverId?: Types.ObjectId | string | null; conductorId?: Types.ObjectId | string | null }
) {
  if (!dutyCoversToday(duty.dateFrom, duty.dateTo)) return;
  const set: Record<string, unknown> = { ...actorFields(req) };
  if (duty.driverId) {
    const driver = await TransportCrew.findOne({ _id: duty.driverId, ...instituteFilter(req) });
    if (driver) {
      set.driverId = driver._id;
      set.driverName = driver.name;
      set.driverPhone = driver.phone || '';
      await TransportCrew.updateOne(
        { _id: driver._id },
        { $set: { vehicleId: duty.vehicleId, ...actorFields(req) } }
      );
    }
  }
  if (duty.conductorId) {
    await TransportCrew.updateOne(
      { _id: duty.conductorId, ...instituteFilter(req) },
      { $set: { vehicleId: duty.vehicleId, ...actorFields(req) } }
    );
    set.conductorId = duty.conductorId;
  }
  await Vehicle.updateOne({ _id: duty.vehicleId, ...instituteFilter(req) }, { $set: set });
}

async function closeOpenCrewDuties(
  req: Parameters<typeof instituteFilter>[0],
  opts: { crewId: Types.ObjectId; role: 'driver' | 'conductor'; vehicleId: string }
) {
  const field = opts.role === 'driver' ? 'driverId' : 'conductorId';
  const today = todayYmd();
  await TransportDuty.updateMany(
    {
      ...instituteFilter(req),
      [field]: opts.crewId,
      vehicleId: opts.vehicleId,
      $or: [{ dateTo: null }, { dateTo: '' }, { dateTo: { $exists: false } }],
    },
    { $set: { dateTo: shiftYmd(today, -1), ...actorFields(req) } }
  );
}

async function logCrewVehicleChange(
  req: Parameters<typeof instituteFilter>[0],
  opts: { crew: { _id: Types.ObjectId; role: 'driver' | 'conductor' }; vehicleId: string }
) {
  const vehicle = await Vehicle.findOne({ _id: opts.vehicleId, ...instituteFilter(req) });
  if (!vehicle) return;
  const first = (vehicle.timings || [])[0];
  const route =
    first?.route ||
    (vehicle.routeNumber ? `Route ${vehicle.routeNumber}` : 'Unassigned');
  await TransportDuty.create({
    instituteId: req.user!.instituteId,
    dateFrom: todayYmd(),
    vehicleId: vehicle._id,
    route,
    routeId: first?.routeId,
    time: first?.time,
    driverId: opts.crew.role === 'driver' ? opts.crew._id : vehicle.driverId,
    conductorId: opts.crew.role === 'conductor' ? opts.crew._id : vehicle.conductorId,
    ...actorFields(req, true),
  });
}

transportRouter.get(
  '/duties',
  requirePermission('transport.view', 'transport.manage'),
  asyncHandler(async (req, res) => {
    const vehicleId = typeof req.query.vehicleId === 'string' ? req.query.vehicleId : undefined;
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : undefined;
    const conductorId = typeof req.query.conductorId === 'string' ? req.query.conductorId : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const filter: Record<string, unknown> = { ...instituteFilter(req) };
    if (vehicleId) filter.vehicleId = vehicleId;
    if (from || to) {
      filter.dateFrom = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }
    if (driverId || conductorId) {
      const crewId = driverId || conductorId;
      const related = await TransportRelief.find({
        ...instituteFilter(req),
        $or: [{ originalId: crewId }, { reliefId: crewId }],
      }).select('dutyId');
      const dutyIds = related.map((r) => r.dutyId);
      const assigned = driverId ? { driverId } : { conductorId };
      filter.$or = [assigned, ...(dutyIds.length ? [{ _id: { $in: dutyIds } }] : [])];
    }
    const items = await populateDuty(TransportDuty.find(filter).sort({ dateFrom: -1, time: 1 }));
    return ok(res, await attachReliefs(items));
  })
);

transportRouter.post(
  '/duties',
  requirePermission('transport.manage'),
  audit('transport_duty', 'create'),
  asyncHandler(async (req, res) => {
    const body = dutyBodySchema.parse(req.body);
    if (body.dateTo && body.dateTo < body.dateFrom) {
      throw new AppError(400, 'VALIDATION', 'End date cannot be before start date');
    }
    const item = await TransportDuty.create({
      ...dutyFields(body),
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    await applyDutySnapshot(req, item);
    const populated = await populateDuty(TransportDuty.findById(item._id));
    return ok(res, (await attachReliefs(populated ? [populated] : []))[0] || populated, undefined, 201);
  })
);

transportRouter.patch(
  '/duties/:id',
  requirePermission('transport.manage'),
  audit('transport_duty', 'update'),
  asyncHandler(async (req, res) => {
    const body = dutyBodySchema.partial().parse(req.body);
    const existing = await TransportDuty.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Duty not found');
    const dateFrom = body.dateFrom ?? existing.dateFrom;
    const dateTo = body.dateTo === undefined ? existing.dateTo : body.dateTo || undefined;
    if (dateTo && dateFrom && dateTo < dateFrom) {
      throw new AppError(400, 'VALIDATION', 'End date cannot be before start date');
    }
    const next = {
      ...(body.dateFrom ? { dateFrom: body.dateFrom } : {}),
      ...(body.dateTo !== undefined ? { dateTo: body.dateTo || undefined } : {}),
      ...(body.vehicleId ? { vehicleId: body.vehicleId } : {}),
      ...(body.route ? { route: body.route.trim() } : {}),
      ...(body.routeId !== undefined ? { routeId: body.routeId || undefined } : {}),
      ...(body.time !== undefined ? { time: body.time || undefined } : {}),
      ...(body.driverId !== undefined ? { driverId: body.driverId || undefined } : {}),
      ...(body.conductorId !== undefined ? { conductorId: body.conductorId || undefined } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || undefined } : {}),
      ...actorFields(req),
    };
    const item = await TransportDuty.findOneAndUpdate(
      { _id: existing._id },
      { $set: next },
      { new: true }
    );
    if (item) await applyDutySnapshot(req, item);
    const populated = await populateDuty(TransportDuty.findById(existing._id));
    return ok(res, (await attachReliefs(populated ? [populated] : []))[0] || populated);
  })
);

transportRouter.delete(
  '/duties/:id',
  requirePermission('transport.manage'),
  audit('transport_duty', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await TransportDuty.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Duty not found');
    return ok(res, item);
  })
);

const reliefReasonSchema = z.enum(['emergency_leave', 'sick', 'personal', 'shift_swap', 'custom', 'other']);

async function applyReliefSnapshot(
  req: Parameters<typeof instituteFilter>[0],
  relief: { dateFrom: string; dateTo?: string | null; dutyId: Types.ObjectId; role: 'driver' | 'conductor'; reliefId: Types.ObjectId }
) {
  if (!dutyCoversToday(relief.dateFrom, relief.dateTo)) return;
  const duty = await TransportDuty.findOne({ _id: relief.dutyId, ...instituteFilter(req) });
  if (!duty) return;
  const cover = await TransportCrew.findOne({ _id: relief.reliefId, ...instituteFilter(req) });
  if (!cover) return;
  if (relief.role === 'driver') {
    await Vehicle.updateOne(
      { _id: duty.vehicleId, ...instituteFilter(req) },
      {
        $set: {
          driverId: cover._id,
          driverName: cover.name,
          driverPhone: cover.phone || '',
          ...actorFields(req),
        },
      }
    );
    await TransportCrew.updateOne({ _id: cover._id }, { $set: { vehicleId: duty.vehicleId, ...actorFields(req) } });
  } else {
    await Vehicle.updateOne(
      { _id: duty.vehicleId, ...instituteFilter(req) },
      { $set: { conductorId: cover._id, ...actorFields(req) } }
    );
    await TransportCrew.updateOne({ _id: cover._id }, { $set: { vehicleId: duty.vehicleId, ...actorFields(req) } });
  }
}

transportRouter.post(
  '/reliefs',
  requirePermission('transport.manage'),
  audit('transport_relief', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        dutyId: z.string().min(1),
        dateFrom: ymdSchema,
        dateTo: ymdSchema.optional().or(z.literal('')),
        role: crewRoleSchema,
        originalId: z.string().min(1),
        reliefId: z.string().min(1),
        reason: reliefReasonSchema.optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    if (body.originalId === body.reliefId) {
      throw new AppError(400, 'VALIDATION', 'Replacement must be a different person');
    }
    if (body.dateTo && body.dateTo < body.dateFrom) {
      throw new AppError(400, 'VALIDATION', 'End date cannot be before start date');
    }
    const reason = body.reason || 'custom';
    const notes = (body.notes || '').trim();
    if ((reason === 'custom' || reason === 'other') && !notes) {
      throw new AppError(400, 'VALIDATION', 'Enter a custom message for this cover');
    }
    const duty = await TransportDuty.findOne({ _id: body.dutyId, ...instituteFilter(req) });
    if (!duty) throw new AppError(404, 'NOT_FOUND', 'Duty not found');
    const rostered = body.role === 'driver' ? duty.driverId : duty.conductorId;
    if (!rostered || String(rostered) !== body.originalId) {
      throw new AppError(400, 'VALIDATION', 'Person being replaced must be the rostered driver or conductor for this duty');
    }
    const item = await TransportRelief.create({
      instituteId: req.user!.instituteId,
      dutyId: duty._id,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo || undefined,
      role: body.role,
      originalId: body.originalId,
      reliefId: body.reliefId,
      reason,
      notes: notes || undefined,
      ...actorFields(req, true),
    });
    await applyReliefSnapshot(req, item);
    const populated = await TransportRelief.findById(item._id)
      .populate('originalId', 'name phone photoUrl role')
      .populate('reliefId', 'name phone photoUrl role');
    return ok(res, populated, undefined, 201);
  })
);

transportRouter.delete(
  '/reliefs/:id',
  requirePermission('transport.manage'),
  audit('transport_relief', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await TransportRelief.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Relief not found');
    return ok(res, item);
  })
);

transportRouter.get(
  '/routes',
  requirePermission('transport.view', 'transport.manage'),
  asyncHandler(async (req, res) => {
    const items = await TransportRoute.find(instituteFilter(req)).populate('vehicleId').sort('name');
    return ok(res, items);
  })
);

transportRouter.post(
  '/routes',
  requirePermission('transport.manage'),
  audit('route', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string(),
        vehicleId: z.string().optional(),
        campusId: z.string().optional(),
        stops: z
          .array(z.object({ name: z.string(), order: z.number(), pickupTime: z.string().optional() }))
          .optional(),
      })
      .parse(req.body);
    const item = await TransportRoute.create({
      ...body,
      stops: body.stops ?? [],
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

transportRouter.patch(
  '/routes/:id',
  requirePermission('transport.manage'),
  audit('route', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().optional(),
        vehicleId: z.string().optional(),
        stops: z
          .array(z.object({ name: z.string(), order: z.number(), pickupTime: z.string().optional() }))
          .optional(),
      })
      .parse(req.body);
    const item = await TransportRoute.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Route not found');
    return ok(res, item);
  })
);

/** Distance-based fee slabs — assigned per student, not whole class */
transportRouter.get(
  '/fee-tiers',
  requirePermission('transport.view', 'transport.manage', 'fees.view'),
  asyncHandler(async (req, res) => {
    const items = await TransportFeeTier.find(instituteFilter(req)).sort('maxKm');
    return ok(res, items);
  })
);

transportRouter.post(
  '/fee-tiers',
  requirePermission('transport.manage', 'fees.manage'),
  audit('transport_fee_tier', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        maxKm: z.number().positive(),
        monthlyAmount: z.number().nonnegative(),
      })
      .parse(req.body);
    const item = await TransportFeeTier.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

transportRouter.patch(
  '/fee-tiers/:id',
  requirePermission('transport.manage', 'fees.manage'),
  audit('transport_fee_tier', 'update'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1).optional(),
        maxKm: z.number().positive().optional(),
        monthlyAmount: z.number().nonnegative().optional(),
      })
      .parse(req.body);
    const item = await TransportFeeTier.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { ...body, ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Fee tier not found');
    return ok(res, item);
  })
);

transportRouter.delete(
  '/fee-tiers/:id',
  requirePermission('transport.manage', 'fees.manage'),
  audit('transport_fee_tier', 'delete'),
  asyncHandler(async (req, res) => {
    const item = await TransportFeeTier.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { deletedAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!item) throw new AppError(404, 'NOT_FOUND', 'Fee tier not found');
    return ok(res, item);
  })
);

async function closeOpenTransportLogs(
  req: Parameters<typeof instituteFilter>[0],
  studentId: string,
  changeType: 'route_changed' | 'unassigned' | 'left_school',
  onDate: string
) {
  await StudentTransportLog.updateMany(
    {
      ...instituteFilter(req),
      studentId,
      $or: [{ dateTo: null }, { dateTo: '' }, { dateTo: { $exists: false } }],
    },
    { $set: { dateTo: onDate, changeType, ...actorFields(req) } }
  );
}

transportRouter.get(
  '/vehicles/:id/boarding',
  requirePermission('transport.view', 'transport.manage'),
  asyncHandler(async (req, res) => {
    const date =
      typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : todayYmd();
    const vehicle = await Vehicle.findOne({ _id: req.params.id, ...instituteFilter(req) });
    if (!vehicle) throw new AppError(404, 'NOT_FOUND', 'Vehicle not found');

    const duties = await TransportDuty.find({
      ...instituteFilter(req),
      vehicleId: vehicle._id,
      dateFrom: { $lte: date },
      $or: [{ dateTo: null }, { dateTo: '' }, { dateTo: { $exists: false } }, { dateTo: { $gte: date } }],
    });
    const routeIds = new Set<string>();
    const routeNames: string[] = [];
    for (const d of duties) {
      if (d.routeId) routeIds.add(String(d.routeId));
      if (d.route) routeNames.push(d.route);
    }
    const linkedRoutes = await TransportRoute.find({
      ...instituteFilter(req),
      $or: [
        { vehicleId: vehicle._id },
        ...(routeIds.size ? [{ _id: { $in: [...routeIds] } }] : []),
        ...(routeNames.length ? [{ name: { $in: routeNames } }] : []),
      ],
    });
    for (const r of linkedRoutes) routeIds.add(String(r._id));
    const ids = [...routeIds];

    let logs: Array<Record<string, unknown>> = [];
    if (ids.length) {
      const found = await StudentTransportLog.find({
        ...instituteFilter(req),
        routeId: { $in: ids },
        dateFrom: { $lte: date },
        $or: [{ dateTo: null }, { dateTo: '' }, { dateTo: { $exists: false } }, { dateTo: { $gte: date } }],
      })
        .populate('studentId', 'firstName lastName admissionNo status photoUrl')
        .populate('routeId', 'name');
      logs = found.map((l) => l.toObject());
    }

    if (!logs.length && ids.length) {
      const current = await StudentTransport.find({
        ...instituteFilter(req),
        routeId: { $in: ids },
      })
        .populate('studentId', 'firstName lastName admissionNo status photoUrl')
        .populate('routeId', 'name');
      logs = current.map((a) => ({
        studentId: a.studentId,
        routeId: a.routeId,
        stopName: a.stopName,
        dateFrom: date,
        changeType: 'assigned',
      }));
    }

    const studentIds = logs
      .map((l) => {
        const s = l.studentId as { _id?: unknown } | string | null;
        if (!s) return '';
        if (typeof s === 'object' && s._id) return String(s._id);
        return String(s);
      })
      .filter(Boolean);

    const attendanceRows = studentIds.length
      ? await StudentAttendance.find({
          ...instituteFilter(req),
          studentId: { $in: studentIds },
          date,
        })
      : [];
    const attendanceByStudent = new Map(attendanceRows.map((a) => [String(a.studentId), a]));

    const students = logs.map((l) => {
      const student = l.studentId as {
        _id?: unknown;
        firstName?: string;
        lastName?: string;
        admissionNo?: string;
        status?: string;
        photoUrl?: string;
      } | null;
      const route = l.routeId as { name?: string } | null;
      const sid = student?._id ? String(student._id) : '';
      const att = attendanceByStudent.get(sid);
      const dateTo = typeof l.dateTo === 'string' ? l.dateTo : '';
      const dateFrom = typeof l.dateFrom === 'string' ? l.dateFrom : '';
      const changeType = String(l.changeType || 'assigned');
      const status = student?.status || 'active';
      let boarding: 'onboard' | 'not_available' | 'route_changed' | 'left_school' | 'joined' = 'onboard';
      if (dateTo === date && changeType === 'left_school') boarding = 'left_school';
      else if (status === 'left' || status === 'alumni') boarding = 'left_school';
      else if (dateTo === date && (changeType === 'route_changed' || changeType === 'unassigned')) {
        boarding = 'route_changed';
      } else if (dateFrom === date && changeType === 'route_changed') boarding = 'joined';
      else if (att && (att.status === 'absent' || att.status === 'excused' || att.status === 'late')) {
        boarding = 'not_available';
      }
      return {
        studentId: sid,
        admissionNo: student?.admissionNo || '',
        name: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
        photoUrl: student?.photoUrl,
        studentStatus: status,
        stopName: l.stopName,
        routeName: route?.name || '',
        boarding,
        attendance: att?.status || null,
        changeType,
      };
    });

    return ok(res, {
      date,
      vehicle: { _id: vehicle._id, number: vehicle.number, routeNumber: vehicle.routeNumber },
      duties: duties.map((d) => ({
        _id: d._id,
        dateFrom: d.dateFrom,
        dateTo: d.dateTo,
        route: d.route,
        time: d.time,
      })),
      summary: {
        total: students.length,
        onboard: students.filter((s) => s.boarding === 'onboard' || s.boarding === 'joined').length,
        notAvailable: students.filter((s) => s.boarding === 'not_available').length,
        routeChanged: students.filter((s) => s.boarding === 'route_changed').length,
        leftSchool: students.filter((s) => s.boarding === 'left_school').length,
        joined: students.filter((s) => s.boarding === 'joined').length,
      },
      students,
    });
  })
);

transportRouter.post(
  '/assignments',
  requirePermission('transport.manage'),
  audit('student_transport', 'assign'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        studentId: z.string(),
        routeId: z.string(),
        stopName: z.string(),
        feeTierId: z.string().optional(),
        monthlyFee: z.number().nonnegative().optional(),
      })
      .parse(req.body);

    const previous = await StudentTransport.findOne({
      instituteId: req.user!.instituteId,
      studentId: body.studentId,
      deletedAt: null,
    });
    const prevRouteId = previous?.routeId ? String(previous.routeId) : '';
    const changed = Boolean(prevRouteId && prevRouteId !== body.routeId);
    const today = todayYmd();
    if (changed) {
      await closeOpenTransportLogs(req, body.studentId, 'route_changed', today);
    }

    let monthlyFee = body.monthlyFee ?? 0;
    let feeTierId = body.feeTierId;
    if (feeTierId) {
      const tier = await TransportFeeTier.findOne({
        _id: feeTierId,
        ...instituteFilter(req),
      });
      if (!tier) throw new AppError(404, 'NOT_FOUND', 'Transport fee tier not found');
      monthlyFee = tier.monthlyAmount;
    }

    const item = await StudentTransport.findOneAndUpdate(
      { instituteId: req.user!.instituteId, studentId: body.studentId, deletedAt: null },
      {
        $set: {
          routeId: body.routeId,
          stopName: body.stopName,
          feeTierId: feeTierId || undefined,
          monthlyFee,
          deletedAt: null,
          ...actorFields(req),
        },
        $setOnInsert: {
          instituteId: req.user!.instituteId,
          studentId: body.studentId,
          ...actorFields(req, true),
        },
      },
      { upsert: true, new: true }
    )
      .populate('routeId', 'name')
      .populate('feeTierId', 'name maxKm monthlyAmount');

    if (!previous || changed) {
      await StudentTransportLog.create({
        instituteId: req.user!.instituteId,
        studentId: body.studentId,
        routeId: body.routeId,
        stopName: body.stopName,
        dateFrom: today,
        changeType: changed ? 'route_changed' : 'assigned',
        ...actorFields(req, true),
      });
    } else if (previous.stopName !== body.stopName) {
      await StudentTransportLog.updateMany(
        {
          ...instituteFilter(req),
          studentId: body.studentId,
          $or: [{ dateTo: null }, { dateTo: '' }, { dateTo: { $exists: false } }],
        },
        { $set: { stopName: body.stopName, ...actorFields(req) } }
      );
    }
    return ok(res, item, undefined, 201);
  })
);

transportRouter.get(
  '/assignments',
  requirePermission('transport.view'),
  asyncHandler(async (req, res) => {
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const items = await StudentTransport.find({
      ...instituteFilter(req),
      ...(studentId ? { studentId } : {}),
    })
      .populate('studentId', 'firstName lastName admissionNo')
      .populate('routeId', 'name')
      .populate('feeTierId', 'name maxKm monthlyAmount');
    return ok(res, items);
  })
);
