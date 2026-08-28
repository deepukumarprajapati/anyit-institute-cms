import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authenticate, requirePermission } from '../middleware/auth';
import { audit } from '../middleware/audit';
import { AuditLog } from '../models/AuditLog';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { parsePagination } from '../utils/query';
import { ok, paginationMeta } from '../utils/response';

export const auditRouter = Router();
auditRouter.use(authenticate);

auditRouter.get(
  '/',
  requirePermission('audit.view'),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req);
    const filter = { instituteId: req.user!.instituteId };
    const [items, total] = await Promise.all([
      AuditLog.find(filter).populate('userId', 'name email').skip(skip).limit(limit).sort('-createdAt'),
      AuditLog.countDocuments(filter),
    ]);
    return ok(res, items, paginationMeta(page, limit, total));
  })
);

const uploadRoot = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const uploadsRouter = Router();
uploadsRouter.use(authenticate);

uploadsRouter.post(
  '/',
  requirePermission('uploads.manage'),
  audit('upload', 'create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return ok(res, { url: null });
    }
    const url = `/uploads/${req.file.filename}`;
    return ok(res, { url, filename: req.file.filename, size: req.file.size }, undefined, 201);
  })
);
