import bcrypt from 'bcryptjs';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { authenticate, signAccessToken, signRefreshToken } from '../middleware/auth';
import { Institute } from '../models/Institute';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { ok } from '../utils/response';
import { notDeleted } from '../models/base';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const authRouter = Router();

authRouter.get(
  '/branding',
  asyncHandler(async (_req, res) => {
    const institute = await Institute.findOne({ ...notDeleted() }).select(
      'name logoUrl loginBackgroundUrl'
    );
    return ok(res, {
      name: institute?.name ?? 'ANYIT INSTITUTE',
      logoUrl: institute?.logoUrl ?? '',
      loginBackgroundUrl: institute?.loginBackgroundUrl ?? '',
    });
  })
);

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await User.findOne({ email: body.email.toLowerCase(), ...notDeleted(), isActive: true });
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const role = await Role.findById(user.roleId);
    if (!role) throw new AppError(403, 'FORBIDDEN', 'Role missing');

    const accessToken = signAccessToken({
      id: String(user._id),
      instituteId: String(user.instituteId),
      roleId: String(user.roleId),
    });
    const refreshToken = signRefreshToken({
      id: String(user._id),
      instituteId: String(user.instituteId),
    });

    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    user.lastLoginAt = new Date();
    await user.save();

    return ok(res, {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        instituteId: user.instituteId,
        role: { id: role._id, key: role.key, name: role.name, permissions: role.permissions },
      },
    });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const refreshToken = z.string().parse(req.body.refreshToken);
    let payload: { sub: string; instituteId: string; type: string };
    try {
      payload = jwt.verify(refreshToken, env.jwtRefreshSecret) as typeof payload;
    } catch {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }
    if (payload.type !== 'refresh') throw new AppError(401, 'UNAUTHORIZED', 'Invalid token type');

    const user = await User.findOne({ _id: payload.sub, instituteId: payload.instituteId, ...notDeleted(), isActive: true });
    if (!user?.refreshTokenHash) throw new AppError(401, 'UNAUTHORIZED', 'Session expired');

    const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!match) throw new AppError(401, 'UNAUTHORIZED', 'Session expired');

    const accessToken = signAccessToken({
      id: String(user._id),
      instituteId: String(user.instituteId),
      roleId: String(user.roleId),
    });
    const newRefresh = signRefreshToken({
      id: String(user._id),
      instituteId: String(user.instituteId),
    });
    user.refreshTokenHash = await bcrypt.hash(newRefresh, 10);
    await user.save();

    return ok(res, { accessToken, refreshToken: newRefresh });
  })
);

authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req, res) => {
    await User.updateOne({ _id: req.user!.id }, { $set: { refreshTokenHash: null } });
    return ok(res, { loggedOut: true });
  })
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user!.id).select('-passwordHash -refreshTokenHash');
    const role = await Role.findById(req.user!.roleId);
    return ok(res, { user, role, permissions: req.user!.permissions });
  })
);
