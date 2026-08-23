# AnyIT Institute CMS — Agent guide

Use this file on **any machine** after `git pull` so new Cursor chats inherit project context
even when the old chat UI is not synced (Cursor stores local chats per laptop).

## Stack

- Monorepo: `apps/api` (Express + MongoDB), `apps/web` (Vue 3 + Ant Design Vue + Vite), `packages/shared`
- Demo login: `admin@anyit.local` / `Admin@12345`
- Env: copy `.env.example` → `.env`; Mongo via `docker-compose.yml`

## Commands

```bash
npm install
npm run dev          # api + web
npm run seed         # seed data (empty machine only)
npm run seed:reset   # drop DB + reseed (wipes local + synced data)
npm run data:export  # snapshot Mongo + uploads into data/snapshot (commit + push)
npm run data:import  # after git pull: restore snapshot into local Mongo + uploads
```

Laptop sync: export → commit `data/snapshot` → push. On the other machine: pull → `docker compose up -d` → `npm run data:import`. Do not `seed:reset` after import.

## Fees / payments (important product rules)

1. **Save as Paid** (Create invoice) applies cash to open invoices **oldest month first**.
2. Leftover / no dues → recorded as **`source: 'advance'`** (advance paid), not fake pending.
3. **Payment history** groups one payment action into **one receipt line** (`paymentBatchId`).
4. Student profile **“Payments received this month”** uses **paidAt month** (when cash was taken), not only invoice billing month. Batches are merged to one line.
5. **Inactive academic years are closed**: no live pending after promotion; seed fully pays past sessions. UI shows “(closed)” / year-closed banner.
6. Month ledger: **Prev. due / Month due / Balance** carry-forward; after full settle, earlier months keep historical dues in **green**; payment month balance **₹0**.
7. Dashboard **Fees deep dive**: Pending column last; **red if > 0**, **green if 0**.

## Key files

| Area | Path |
|------|------|
| Fee settle / advance / batches | `apps/api/src/routes/fees.ts` |
| Student fee ledger | `apps/api/src/services/studentProfile.ts` |
| Student fees UI | `apps/web/src/views/StudentDetailView.vue` |
| Create invoice dialog | `apps/web/src/components/DraggableDialog.vue`, `FeesView.vue` |
| Dashboard fee dive | `apps/web/src/views/DashboardView.vue` |
| History seed | `apps/api/src/seed/mockHistory.ts` |

## Session history in git

Readable + raw exports live under `docs/session-history/`.
On a new laptop: `git pull`, open this repo in Cursor, and point the agent at `AGENTS.md` + that folder if you need prior decisions.

To refresh the export from this machine: `npm run export:session` (or PowerShell script in `scripts/`).

## UX notes

- Prefer silent refresh (`load({ silent: true })`) — don’t blank pages on reload.
- Draggable create-invoice dialog: dropdowns need z-index above the dialog (handled in `DraggableDialog.vue`).
