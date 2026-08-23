/**
 * Snapshot local Mongo + uploaded files into git so another laptop can restore
 * the same working data after `git pull`.
 *
 *   npm run data:export   # this machine → data/snapshot
 *   npm run data:import   # data/snapshot → this machine
 */
import fs from 'fs';
import path from 'path';
import { EJSON } from 'bson';
import mongoose from 'mongoose';
import { connectDb } from '../db/connect';

const SKIP_COLLECTIONS = new Set(['system.views', 'system.profile']);
const INSERT_BATCH = 500;

type Manifest = {
  exportedAt: string;
  dbName: string;
  collections: Record<string, number>;
  files: string[];
};

function repoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (
      fs.existsSync(path.join(dir, 'docker-compose.yml')) &&
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), '../..');
}

function snapshotDir() {
  return path.join(repoRoot(), 'data', 'snapshot');
}

function collectionsDir() {
  return path.join(snapshotDir(), 'collections');
}

function snapshotFilesDir() {
  return path.join(snapshotDir(), 'files');
}

function liveUploadDirs(): string[] {
  const root = repoRoot();
  const fromCwd = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads');
  const candidates = [
    fromCwd,
    path.join(root, 'apps', 'api', 'uploads'),
    path.join(root, 'uploads'),
  ];
  return [...new Set(candidates)].filter((dir) => fs.existsSync(dir));
}

function primaryUploadDir(): string {
  const existing = liveUploadDirs();
  if (existing[0]) return existing[0];
  const fallback = path.join(repoRoot(), 'apps', 'api', 'uploads');
  fs.mkdirSync(fallback, { recursive: true });
  return fallback;
}

function emptyDir(dir: string) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function listFilesRecursive(dir: string, prefix = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(path.join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

function copyTree(src: string, dest: string) {
  if (!fs.existsSync(src)) return 0;
  fs.cpSync(src, dest, { recursive: true });
  return listFilesRecursive(dest).length;
}

async function exportSnapshot() {
  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');

  const snap = snapshotDir();
  emptyDir(collectionsDir());
  emptyDir(snapshotFilesDir());

  const collections: Record<string, number> = {};
  const names = (await db.listCollections().toArray())
    .map((c) => c.name)
    .filter((name) => !SKIP_COLLECTIONS.has(name))
    .sort();

  for (const name of names) {
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(collectionsDir(), `${name}.json`);
    fs.writeFileSync(file, EJSON.stringify(docs, { relaxed: false }));
    collections[name] = docs.length;
    console.log(`[data:export] ${name}: ${docs.length} documents`);
  }

  const files: string[] = [];
  const destFiles = snapshotFilesDir();
  for (const src of liveUploadDirs()) {
    for (const rel of listFilesRecursive(src)) {
      const from = path.join(src, rel);
      const to = path.join(destFiles, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      if (!files.includes(rel)) files.push(rel);
    }
  }
  files.sort();
  console.log(`[data:export] files: ${files.length} (${liveUploadDirs().join(', ') || 'none'})`);

  const manifest: Manifest = {
    exportedAt: new Date().toISOString(),
    dbName: db.databaseName,
    collections,
    files,
  };
  fs.writeFileSync(path.join(snap, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(snap, 'README.md'),
    [
      '# Data snapshot',
      '',
      `Exported **${manifest.exportedAt}** from \`${manifest.dbName}\`.`,
      '',
      'Regenerate on the machine that has the latest work:',
      '',
      '```bash',
      'npm run data:export',
      '```',
      '',
      'Restore after `git pull` on another laptop (Mongo must be running):',
      '',
      '```bash',
      'npm run data:import',
      '```',
      '',
    ].join('\n')
  );

  console.log(`[data:export] wrote ${path.relative(repoRoot(), snap)}`);
  await mongoose.disconnect();
}

async function importSnapshot() {
  const manifestPath = path.join(snapshotDir(), 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `No snapshot at ${path.relative(process.cwd(), snapshotDir())}. Run npm run data:export on the other laptop first.`
    );
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;

  await connectDb();
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');

  console.log(
    `[data:import] replacing local database with snapshot from ${manifest.exportedAt}`
  );
  await db.dropDatabase();

  const colDir = collectionsDir();
  const files = fs
    .readdirSync(colDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const name = file.replace(/\.json$/, '');
    const raw = fs.readFileSync(path.join(colDir, file), 'utf8');
    const docs = EJSON.parse(raw) as Record<string, unknown>[];
    if (!Array.isArray(docs) || docs.length === 0) {
      console.log(`[data:import] ${name}: 0 documents`);
      continue;
    }
    const col = db.collection(name);
    for (let i = 0; i < docs.length; i += INSERT_BATCH) {
      await col.insertMany(docs.slice(i, i + INSERT_BATCH), { ordered: false });
    }
    console.log(`[data:import] ${name}: ${docs.length} documents`);
  }

  const dest = primaryUploadDir();
  emptyDir(dest);
  const copied = copyTree(snapshotFilesDir(), dest);
  console.log(`[data:import] files: ${copied} → ${dest}`);

  console.log('[data:import] done. Start the app with npm run dev (do not seed:reset).');
  await mongoose.disconnect();
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === 'export') {
    await exportSnapshot();
    return;
  }
  if (cmd === 'import') {
    await importSnapshot();
    return;
  }
  console.error('Usage: tsx src/scripts/syncData.ts <export|import>');
  process.exit(1);
}

main().catch((err) => {
  console.error(`[data] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
