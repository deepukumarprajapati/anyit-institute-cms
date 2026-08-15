import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { Payroll, SalaryStructure } from '../models/Salary';
import { Staff } from '../models/Staff';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { actorFields, instituteFilter } from '../utils/query';
import { ok } from '../utils/response';

export const salaryRouter = Router();
salaryRouter.use(authenticate);

salaryRouter.get(
  '/structures',
  requirePermission('salary.view', 'salary.manage'),
  asyncHandler(async (req, res) => {
    const items = await SalaryStructure.find(instituteFilter(req))
      .populate('staffId', 'firstName lastName employeeCode')
      .sort('-effectiveFrom');
    return ok(res, items);
  })
);

salaryRouter.post(
  '/structures',
  requirePermission('salary.manage'),
  audit('salary_structure', 'create'),
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        staffId: z.string(),
        basic: z.number().nonnegative(),
        allowances: z.array(z.object({ name: z.string(), amount: z.number() })).optional(),
        deductions: z.array(z.object({ name: z.string(), amount: z.number() })).optional(),
        effectiveFrom: z.string(),
      })
      .parse(req.body);
    const staff = await Staff.findOne({ _id: body.staffId, ...instituteFilter(req) });
    if (!staff) throw new AppError(400, 'INVALID_STAFF', 'Staff not found');
    const item = await SalaryStructure.create({
      ...body,
      allowances: body.allowances ?? [],
      deductions: body.deductions ?? [],
      effectiveFrom: new Date(body.effectiveFrom),
      instituteId: req.user!.instituteId,
      ...actorFields(req, true),
    });
    return ok(res, item, undefined, 201);
  })
);

salaryRouter.get(
  '/payrolls',
  requirePermission('salary.view'),
  asyncHandler(async (req, res) => {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const items = await Payroll.find({
      ...instituteFilter(req),
      ...(month ? { month } : {}),
    })
      .populate('staffId', 'firstName lastName employeeCode')
      .sort('-month');
    return ok(res, items);
  })
);

salaryRouter.post(
  '/payrolls/run',
  requirePermission('salary.run'),
  audit('payroll', 'run'),
  asyncHandler(async (req, res) => {
    const body = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(req.body);
    const staffList = await Staff.find({ ...instituteFilter(req), status: 'active' });
    const created = [];

    for (const staff of staffList) {
      const structure = await SalaryStructure.findOne({
        ...instituteFilter(req),
        staffId: staff._id,
      }).sort('-effectiveFrom');
      if (!structure) continue;

      const allowancesTotal = structure.allowances.reduce((s, a) => s + a.amount, 0);
      const deductionsTotal = structure.deductions.reduce((s, d) => s + d.amount, 0);
      const netPay = structure.basic + allowancesTotal - deductionsTotal;

      const payroll = await Payroll.findOneAndUpdate(
        {
          instituteId: req.user!.instituteId,
          staffId: staff._id,
          month: body.month,
          deletedAt: null,
        },
        {
          $set: {
            basic: structure.basic,
            allowancesTotal,
            deductionsTotal,
            netPay,
            status: 'processed',
            ...actorFields(req),
          },
          $setOnInsert: {
            instituteId: req.user!.instituteId,
            staffId: staff._id,
            month: body.month,
            ...actorFields(req, true),
          },
        },
        { upsert: true, new: true }
      );
      created.push(payroll);
    }
    return ok(res, { month: body.month, count: created.length, payrolls: created });
  })
);

salaryRouter.patch(
  '/payrolls/:id/pay',
  requirePermission('salary.run'),
  audit('payroll', 'pay'),
  asyncHandler(async (req, res) => {
    const payroll = await Payroll.findOneAndUpdate(
      { _id: req.params.id, ...instituteFilter(req) },
      { $set: { status: 'paid', paidAt: new Date(), ...actorFields(req) } },
      { new: true }
    );
    if (!payroll) throw new AppError(404, 'NOT_FOUND', 'Payroll not found');
    return ok(res, payroll);
  })
);
