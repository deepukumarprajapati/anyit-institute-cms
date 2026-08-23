# AnyIT Institute CMS

Enterprise single-institute CMS for managing students, staff, attendance, fees, salary, transport, events, and roles.

## Stack

- **Web:** Vue 3 + TypeScript + Vite + Pinia + Vue Router + Ant Design Vue 4 + **ECharts** (animated dashboard graphs)
- **API:** Express.js + TypeScript + Mongoose
- **DB:** MongoDB

## Quick start

```bash
# 1. Start MongoDB
docker compose up -d

# 2. Install deps
npm install

# 3. Env
cp .env.example apps/api/.env

# 4. Seed institute + roles + demo data
npm run seed

# 5. Run API + Web together (ports 4000 + 5173)
npm run dev
```

Or separately: `npm run dev:api` / `npm run dev:web`.

- Web (this PC): http://localhost:5173  
- Web (same Wi‑Fi / LAN): http://\<your-pc-ip\>:5173 — Vite prints the **Network** URL on start  
- API: http://localhost:4000/api/v1/health  

Both servers bind to `0.0.0.0` so other devices on the same network can connect. Allow ports **5173** and **4000** in Windows Firewall if prompted.

## Sync code + data to another laptop

Git tracks the app. The working **database** and **uploaded files** (logo, campus picture, event photos) are snapshotted into `data/snapshot/`.

On the laptop that has the latest work:

```bash
npm run data:export
git add data/snapshot
git commit -m "Sync CMS data snapshot"
git push
```

On the other laptop:

```bash
git pull
docker compose up -d
npm install
npm run data:import
npm run dev
```

`data:import` replaces the local Mongo database and `apps/api/uploads`. Do not run `npm run seed:reset` after import.

## Demo logins

| Role | Email | Password |
|------|-------|----------|
| Super Admin | `admin@anyit.local` | `Admin@12345` |
| Principal | `principal@anyit.local` | `Principal@123` |
| Teacher | `teacher@anyit.local` | `Teacher@123` |
| Accountant | `accountant@anyit.local` | `Account@123` |
| Receptionist | `receptionist@anyit.local` | `Recept@123` |

## Dashboard graphs

The home dashboard uses **animated ECharts** charts backed by `/api/v1/dashboard` (14-day series):

| Chart | What it shows |
|-------|----------------|
| Attendance trend | Daily attendance % with present/absent bars |
| Attendance mix | Donut of present / late / absent / half-day / excused |
| Fee collections | Daily collections bars + trend line |
| Invoice status | Rose pie of paid / partial / issued (and pending amounts) |
| Students by class | Horizontal bars for the active session |

KPI cards summarize active students/staff, 7-day collections, and 7-day attendance, with open dues context.

## Modules

- **Students** — clickable names → profile page (photo, address, fees month-wise, complaints, events, attendance, marks, unit tests, medical) with **all academic years** history
- **Staff**, attendance (student + staff), fees (PDF receipts + preview), salary, transport, events
- **Reports** — class directory, pending fees, student fee ledger
- Academic masters, roles/users, audit, soft-delete restore

## Monorepo

```
apps/api      — Express REST API
apps/web      — Vue admin SPA (Ant Design Vue + ECharts)
packages/shared — shared types & permissions
```
