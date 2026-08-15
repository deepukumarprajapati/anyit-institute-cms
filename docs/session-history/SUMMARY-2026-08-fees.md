# Session summary — Fees & student profile (Aug 2026)

Continuity notes for agents and humans. Full Cursor chat UI is machine-local; this file travels with git.

## Product decisions locked in

### Payments / invoices
- **Create invoice → Save as Paid**: allocate to open invoices oldest-first; leftover or zero dues → **`source: 'advance'`**.
- Success toasts distinguish dues settled vs **advance paid**.
- **Fees → Payments** list: one line per payment action (`paymentBatchId`); not one row per invoice allocation.
- PDF receipt for a batch shows combined total / allocations.

### Student fee month table
- Columns: Billed, Paid, **Prev. due**, **Month due**, **Balance**.
- Carry-forward: Balance = previous Balance + Month due.
- After full payment: payment month Balance ₹0; earlier months keep historical dues in **green**.
- Month-end historical due uses payments against that month’s invoices (`ledgerPayments`), not only cash received that month.

### Payments on student profile
- Expand month → **Payments received this month** = payments by **paidAt** (local calendar month).
- Batched allocations merged to one receipt line.
- Advance payments appear in that month and under **Advance payments**.
- Months with only a payment (no bill) still appear in the list.

### Academic years
- Inactive sessions are **closed**: live pending forced to 0; UI “(closed)” + banner.
- Seed: past sessions fully paid; only active year keeps open dues.

### Dashboard Fees deep dive
- Pending column last; **red if > 0**, **green if ₹0**.

### UI
- `DraggableDialog` for Create invoice (~680px); select/picker dropdowns z-index above dialog.
- Prefer silent reload on mutations (no full-page blank).

## Key paths

- `apps/api/src/routes/fees.ts` — settle, advance, batches  
- `apps/api/src/services/studentProfile.ts` — ledger, yearClosed, paidAt payments  
- `apps/web/src/views/StudentDetailView.vue` — fees UI  
- `apps/web/src/components/DraggableDialog.vue`  
- `apps/web/src/views/DashboardView.vue` — deep dive  
- `apps/api/src/seed/mockHistory.ts` — past years paid  

## Demo

- Login: `admin@anyit.local` / `Admin@12345`  
- Example students used in testing: Kiara Chopra (advance / closed years), Diya Patel (payment month history), Saanvi (payment batching)
