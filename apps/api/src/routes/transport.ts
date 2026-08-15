import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import {
  StudentTransport,
  TransportFeeTier,
  TransportRoute,
  Vehicle,
} from '../models/Transport';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';

export const transportRouter = Router();
transportRouter.use(authenticate);

transportRouter.get(
  '/vehicles',
  requirePermission('transport.view', 'transport.manage'),
  asyncHandler(async (req, res) => ok(res, await Vehicle.find(instituteFilter(req)).sort('number')))
);

transportRouter.post(
  '/vehicles',
  requirePermission('transport.manage'),
  audit('vehicle', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        number: z.string(),
        type: z.string().optional(),
        capacity: z.number().optional(),
        driverName: z.string().optional(),
        driverPhone: z.string().optional(),
        campusId: z.string().optional(),
      })
      .parse(req.body);
    const item = await Vehicle.create({
      ...body,
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
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
