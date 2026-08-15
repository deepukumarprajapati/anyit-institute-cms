import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  /** Bind address — use 0.0.0.0 to accept LAN connections */
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongodbUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/anyit_cms'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-change-in-production-32'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-in-production-32'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  /**
   * Comma-separated origins, or `*` / `true` to reflect request Origin (handy for LAN).
   * Example: http://localhost:5173,http://192.168.1.10:5173
   */
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@anyit.local',
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'Admin@12345',
  bootstrapInstituteName: process.env.BOOTSTRAP_INSTITUTE_NAME ?? 'AnyIT Institute',
};
