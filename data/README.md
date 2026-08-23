# Portable CMS data

`git pull` brings **code**. MongoDB and uploaded files stay on each laptop unless you snapshot them here.

## Workflow

**Laptop you just used** (after fees, students, campus picture, etc.):

```bash
npm run data:export
git add data/snapshot
git commit -m "Sync CMS data snapshot"
git push
```

**Other laptop:**

```bash
git pull
docker compose up -d
npm install
npm run data:import
npm run dev
```

`data:import` **replaces** the local database and `apps/api/uploads` with the snapshot. Do not run `npm run seed:reset` after that, or you will wipe the synced work.

First-time machine with no snapshot yet: `npm run seed` instead of `data:import`.
