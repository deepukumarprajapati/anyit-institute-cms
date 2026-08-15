import os from 'os';
import { createApp } from './app';
import { env } from './config/env';
import { connectDb } from './db/connect';

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(env.port, env.host, () => {
    console.log(`[api] listening on http://localhost:${env.port} (host=${env.host})`);
    for (const ip of lanAddresses()) {
      console.log(`[api] LAN:       http://${ip}:${env.port}`);
    }
  });
}

main().catch((err) => {
  console.error('[api] failed to start', err);
  process.exit(1);
});
