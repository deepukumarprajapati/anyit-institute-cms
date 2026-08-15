import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { errorHandler } from './utils/errors';
import { authRouter } from './routes/auth';
import {
  campusesRouter,
  instituteRouter,
  rolesRouter,
  usersRouter,
} from './routes/institute';
import {
  classesRouter,
  classroomsRouter,
  floorsRouter,
  sectionsRouter,
  sessionsRouter,
  subjectsRouter,
} from './routes/academic';
import { studentsRouter } from './routes/students';
import { staffRouter } from './routes/staff';
import { attendanceRouter } from './routes/attendance';
import { feesRouter } from './routes/fees';
import { salaryRouter } from './routes/salary';
import { transportRouter } from './routes/transport';
import { eventsRouter } from './routes/events';
import { auditRouter, dashboardRouter, uploadsRouter } from './routes/misc';
import { ok } from './utils/response';

function resolveCorsOrigin(raw: string): boolean | string | string[] | ((origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) => void) {
  const value = (raw || '*').trim();
  if (value === '*' || value.toLowerCase() === 'true') {
    // Reflect request Origin so credentials work from any LAN IP
    return true;
  }
  const list = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length === 1) return list[0];
  return list;
}

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: resolveCorsOrigin(env.corsOrigin),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(
    '/api/',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.use('/uploads', express.static(path.resolve(process.cwd(), env.uploadDir)));

  const v1 = express.Router();
  v1.get('/health', (_req, res) => ok(res, { status: 'ok', service: 'anyit-api' }));
  v1.use('/auth', authRouter);
  v1.use('/institute', instituteRouter);
  v1.use('/campuses', campusesRouter);
  v1.use('/roles', rolesRouter);
  v1.use('/users', usersRouter);
  v1.use('/sessions', sessionsRouter);
  v1.use('/classes', classesRouter);
  v1.use('/sections', sectionsRouter);
  v1.use('/subjects', subjectsRouter);
  v1.use('/floors', floorsRouter);
  v1.use('/classrooms', classroomsRouter);
  v1.use('/students', studentsRouter);
  v1.use('/staff', staffRouter);
  v1.use('/attendance', attendanceRouter);
  v1.use('/fees', feesRouter);
  v1.use('/salary', salaryRouter);
  v1.use('/transport', transportRouter);
  v1.use('/events', eventsRouter);
  v1.use('/dashboard', dashboardRouter);
  v1.use('/audit', auditRouter);
  v1.use('/uploads', uploadsRouter);

  app.use('/api/v1', v1);
  app.use(errorHandler);
  return app;
}
