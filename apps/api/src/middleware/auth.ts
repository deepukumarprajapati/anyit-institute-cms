import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { Permission } from '@anyit/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { AppError } from '../utils/errors';
import { notDeleted } from '../models/base';

export type AuthUser = {
  id: string;
  instituteId: string;
  campusId?: string;
  roleId: string;
  email: string;
  name: string;
  permissions: Permission[] | ['*'];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

type AccessPayload = {
  sub: string;
  instituteId: string;
  roleId: string;
  type: 'access';
};

export function signAccessToken(user: { id: string; instituteId: string; roleId: string }) {
  return jwt.sign(
    { sub: user.id, instituteId: user.instituteId, roleId: user.roleId, type: 'access' } satisfies AccessPayload,
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpires as jwt.SignOptions['expiresIn'] }
  );
}

export function signRefreshToken(user: { id: string; instituteId: string }) {
  return jwt.sign(
    { sub: user.id, instituteId: user.instituteId, type: 'refresh' },
    env.jwtRefreshSecret,
    { expiresIn: env.jwtRefreshExpires as jwt.SignOptions['expiresIn'] }
  );
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing access token');
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
    if (payload.type !== 'access') {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid token type');
    }

    const user = await User.findOne({
      _id: payload.sub,
      instituteId: payload.instituteId,
      ...notDeleted(),
      isActive: true,
    });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found or inactive');

    const role = await Role.findOne({ _id: user.roleId, ...notDeleted() });
    if (!role) throw new AppError(403, 'FORBIDDEN', 'Role missing');

    req.user = {
      id: String(user._id),
      instituteId: String(user.instituteId),
      campusId: user.campusId ? String(user.campusId) : undefined,
      roleId: String(user.roleId),
      email: user.email,
      name: user.name,
      permissions: role.permissions as Permission[] | ['*'],
    };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token'));
  }
}

/** Pass one or more permissions — user needs ANY of them (or `*`). */
export function requirePermission(...needed: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'UNAUTHORIZED', 'Not authenticated'));
    const perms = req.user.permissions as string[];
    if (perms.includes('*')) return next();
    const ok = needed.some((p) => perms.includes(p));
    if (!ok) return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
    return next();
  };
}

export function oid(id: string) {
  return new Types.ObjectId(id);
}
