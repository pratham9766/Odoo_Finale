# Scope Reduction Plan — solve only the PDF

> **Historical document.** Written for an earlier multi-mill design and kept for reference. The current system is a single mill; see the [README](../README.md) for what exists today.

> **Goal:** the product solves exactly what [Textile_Manufacturing_System.pdf](../Textile_Manufacturing_System.pdf) asks for — one mill (Everest Textile Mills) — and nothing else.
> **Method:** freeze, hide, and simplify. **Do not delete working code.** Every step below is reversible with git.
> This file replaces docs 01–04 as the **active plan**. Docs 01–04 stay as reference only.

---

## 0. Ground rules

1. **Hide, don't delete.** Unmount routes, remove nav items, switch modules off. Code and tables stay in the repo.
2. **No new features.** From now on, only work that makes a PDF scene work better, or fixes a bug in it.
3. **Every change goes in one branch:** `scope-reduction`. Before starting, tag the current state: `git tag pre-reduction`.
4. **Done = the demo script (§9) runs end to end 3 times in a row with seed data.**

---

## 1. The final scope (one line per PDF scene)

| PDF scene | We build / show | Nothing more |
|---|---|---|
| Yarn arrives at the gate | GRN (supplier name, yarn type, colour, qty, lot, **for which order**) · live stock · low-stock warning · "enough yarn to start?" on the order | No gate register, no supplier portal, no POs to supplier orgs |
| Production floor | Stages · machines (running / idle / breakdown) · which order on which machine + % · breakdown reason + duration · shifts · worker ↔ machine assignment · today's output | No drag-and-drop planning board, no maintenance ticket workflow |
| Fabric check | Rolls · defects (hole, colour mismatch, uneven weave) · pass / rework / reject · passed / failed / waiting lists · roll → order + machine trace | No defect analytics by supplier, no QC override |
| Buyer calls | Order status calculated automatically · order detail page · (optional) public tracking link | No buyer login portal |
| Loading the truck | Dispatch only QC-passed rolls of that order · qty check · **no double dispatch** · invoice made from the rolls · finished stock on shelf | No transporter org, trips, driver app or OTP |
| Owner closing the books | Cost per order · production per machine · wages paid · supplier bills + wages + buyer payments in one place · **monthly profit** | No ageing charts, no wastage variance report |
| "Attendance and wages in a register" | Supervisor marks attendance (present / absent / half day) · monthly wages = days × rate or pieces × rate | No QR kiosk, overtime approval, leave, corrections, advances |

**Out completely:** mobile app · buyer / supplier / transporter portals · 4-domain signup · connect codes / partnerships · platform admin · AI chatbot + insights · kiosk · push · offline queue · custom role editor.

---

## 2. Backend — what to change

Owners: **Vipul** (core / merge), **Hrishikesh** (factory floor modules).

### 2.1 Unmount routers that are out of scope

File: [server/src/modules/index.js](../server/src/modules/index.js)

| Router | Action | Why |
|---|---|---|
| `staff`, `catalog`, `inventory`, `orders`, `notifications`, `orgs`, `production`, `maintenance`, `quality`, `dispatch`, `workforce`, `finance`, `reports` | **Keep** | PDF scenes. `maintenance` stays because `POST /machines/:id/breakdown` lives there |
| `partners`, `procurement`, `transport`, `ai`, `gate` | **Remove the `r.use(...)` line** (keep the import commented) | Not in the PDF |

File: [server/src/app.js](../server/src/app.js)

| Mount | Action |
|---|---|
| `/api/v1/public` | Keep **only if** you show the tracking link; otherwise remove |
| `/api/v1/kiosk` | Remove |
| `/api/v1/admin` (platform) | Remove |
| `/api/v1/me` | Keep (login, org context, staff invite accept) |

Tip: instead of editing lines by hand each time, add `server/src/config/scope.js` with one list, e.g.
`export const ENABLED = ['staff','catalog','inventory','orders','notifications','orgs','production','maintenance','quality','dispatch','workforce','finance','reports'];`
and mount only routers in that list. Re-enabling something later = one word.

### 2.2 Switch off modules inside the mill

`requireModule()` already exists (see [modules.catalog.js](../server/src/modules/orgs/modules.catalog.js)). For Everest, set in `organizations.settings.modules` (seed + live DB):

```json
{ "gate": false, "procurement": false, "transport": false, "ai": false }
```

### 2.3 Cron jobs

Folder: [server/src/jobs/](../server/src/jobs/) — every file is auto-loaded.

| Job | Action |
|---|---|
| `lowStock.js` | **Keep** (PDF: warning before it runs low) |
| `deadlineRisk.js` | **Keep** (order ETA / at-risk on the order page) |
| `insights.js`, `absentAlerts.js`, `missingCheckout.js`, `overduePayments.js`, `unmovedStock.js` | **Skip**: add a `SKIP` set next to `HELPERS` in `jobs/index.js` (or move the files to `jobs/_off/`) |

### 2.4 Event listeners

Folder: [server/src/events/listeners/](../server/src/events/listeners/) — every file is auto-loaded.

| Listener | Action |
|---|---|
| `statusEngine`, `inventoryReactions`, `qualityReactions`, `financeReactions`, `notifier`, `socketEmitter` | Keep |
| `dispatchReactions` | Keep, but the trip / transporter branch must stay unused: **never set `transporter_org_id`** on dispatches (just `vehicle_no`, `driver_name`) |
| `gateReactions` | Skip (same pattern as jobs: a `SKIP` set) |
| `attendanceReactions` | Keep only the parts used by the supervisor grid; skip absent / kiosk reactions |

### 2.5 Roles: 15 → 6

File: [server/src/modules/staff/defaultRoles.js](../server/src/modules/staff/defaultRoles.js)

For `manufacturer`, create only these 6 (keep the other role definitions in the file but unused):

| Role | Permissions (existing keys) |
|---|---|
| **Owner** | ALL |
| **Office** (sales + accounts) | `orders.*`, `orders.view_price`, `items.view`, `bom.view`, `stock.view`, `production.view`, `qc.view`, `dispatch.view`, `invoice.*`, `payment.record`, `expense.manage`, `reports.cost`, `reports.pnl` |
| **Store Keeper** | `items.view`, `bom.view`, `stock.view`, `receipt.create`, `orders.view`, `qc.view`, `dispatch.view`, `dispatch.create`, `dispatch.confirm` |
| **Supervisor** | `orders.view`, `production.view`, `production.plan`, `production.log`, `machine.status`, `assignment.manage`, `breakdown.report`, `breakdown.close`, `qc.view`, `workers.manage`, `attendance.view`, `attendance.mark`, `reports.production` |
| **Operator** | `production.view`, `production.log`, `machine.status`, `breakdown.report` |
| **QC Inspector** | `qc.view`, `qc.inspect` |

Wages (`wages.view`, `wages.run`, `wages.pay`) → Owner only (and Office if you want).
Buyer / supplier / transporter role sets: not created at all.

### 2.6 Signup / onboarding

- `POST /me/orgs` accepts only `type = 'manufacturer'` (reject others with a clear message).
- Staff join through the existing staff invite, or are seeded. No partner invites.

### 2.7 Database — no drops

- **Do not drop tables.** 71 tables exist; unused ones cost nothing. Dropping risks breaking built code.
- **Freeze migrations** at `020`. No new migrations unless a PDF bug needs one.
- **Present only the core ~20 tables** (§6). Ignore the rest in docs, seed and demo.

---

## 3. Seed data — one mill, PDF story only

Files: [db/seed/config.js](../db/seed/config.js), [db/seed/seed.js](../db/seed/seed.js), `db/seed/simulation/*`, `db/seed/b2b.js`

| Change | Detail |
|---|---|
| One org | Keep **Everest Textile Mills** only in `PROFILES` (drop the second mill) |
| No connected portals | Don't run `b2b.js` / "connected portals" step. Buyers and suppliers = **contacts** (names only) |
| Users | Only the 6 roles: `owner@`, `office@`, `store@`, `supervisor@`, `operator@`, `qc@` (password stays `DEMO_PASSWORD`) |
| History length | `--days=30` is enough (faster seed, smaller numbers to explain) |
| Simulation steps | Keep: GRNs, orders, work orders, production logs, breakdowns, rolls + QC, dispatches + invoices, payments, attendance (supervisor method), one wage run, expenses (supplier bills, power). Skip: POs to supplier orgs, trips, gate entries, kiosk punches, leave / OT / corrections |
| Modules | Seed Everest with the module switches from §2.2 |
| "Now" state for the demo | One yarn below reorder level · one machine in breakdown · one order short of yarn · ~10 rolls waiting QC · one rejected roll from W-3 · one order ready to dispatch · last month's wages paid |

---

## 4. Frontend — what to change

Owner: **Omkar**.

### 4.1 Navigation

File: [client/src/config/nav.js](../client/src/config/nav.js)

| Menu item | Action |
|---|---|
| Dashboard | Keep |
| Orders | Keep |
| Inventory → Stock, Goods receipts | Keep |
| Inventory → Items, BOM | Move under **Settings** (setup screens, not daily use) |
| Inventory → Material calculator, Adjustments | Remove |
| Purchase | Remove |
| Production → Machine board, Work orders, Assignments | Keep |
| Production → Planning | Remove (assign machine from the work order / order page instead) |
| Production → Machines | Move under Settings |
| Production → Maintenance | Remove page; breakdowns show **on the machine board** (red card + reason + duration + "Back to running") |
| Quality | Keep |
| Gate register | Remove |
| Dispatch | Keep |
| Workforce → Attendance today, Monthly register, Workers, Wages | Keep |
| Workforce → Leave & corrections | Remove |
| Accounts → Sales invoices, Payments, Bills | Keep; merge into one **Money** page with 3 tabs (Invoices · Bills & expenses · Payments) if time allows |
| Accounts → Receivables, Payables | Remove (the Money page shows "owed to us / we owe" totals) |
| Reports → Cost per order, Monthly P&L, Machine production | Keep |
| Reports → Wastage, Quality, Attendance | Remove |
| Partners | Remove |
| Ask SAMETA AI | Remove |
| Settings | Keep: Organization, Staff, Machines, Shifts, Items, BOM |

Floor nav (`/floor`): keep **Machine**, **Supervisor**, **QC**, **Dispatch** (already the 4 floor pages).

### 4.2 Routes

File: [client/src/router.jsx](../client/src/router.jsx)

| Route group | Action |
|---|---|
| `/app/*` mill office | Keep, minus the removed pages above |
| `/floor/*` | Keep (4 pages) |
| `/buyer/*` (`BuyerOrdersPage`, `BuyerOrderDetail`, `PortalLayout`) | Remove routes |
| `/track/:token` | Keep only if the backend `/public` mount is kept |
| `/onboarding` | Simplify to mill-only setup (name, city, GSTIN, stages, machines, shifts) — or remove and rely on seed |
| `/select-org` | Keep (harmless) but users will only ever have one org |
| `/signup` | Mill owner only — no domain picker. Or hide the link and rely on seeded accounts |
| `/` landing | One message: "Run your textile mill without notebooks and phone calls". No 4-domain cards |

### 4.3 Small UI clean-ups

- Remove every "AI" label (`SAMETA AI`, "Ask SAMETA AI"). Keep the product name **SAMETA** everywhere (docs still say TexLink — see §7).
- `config/portals.js` → `homeFor`: Owner / Office → `/app/dashboard`; Supervisor → `/floor/supervisor`; Operator → `/floor/machine`; QC → `/floor/qc`; Store → `/app/inventory/stock`.
- Order detail page: make sure these 4 blocks are clear — **status stepper**, **"enough yarn?" panel**, **rolls (passed / failed / waiting)**, **dispatches + invoice**. This page answers the buyer's phone call.
- Dashboard: 5 tiles only — Today's output · Machines running / idle / down · Orders at risk · Low-stock items · Profit this month.

### 4.4 Final screen list (12)

1. Login
2. Owner dashboard
3. Stock + Receive yarn (GRN)
4. Orders list + order detail
5. Machine board (with breakdowns) + assignments
6. Floor: operator
7. Floor / office: QC
8. Roll trace
9. Dispatch (pick rolls → confirm → invoice PDF)
10. Attendance (today grid + monthly register) + Workers
11. Wages
12. Money (invoices, bills & expenses, payments) + Reports (cost per order, machine production, monthly P&L)

---

## 5. Remove from the plan (stop all work)

| Item | Where it lives now | Action |
|---|---|---|
| Mobile app | `docs/04_MOBILE_APP_EXECUTION.md` (not built) | Archive the doc; don't start |
| Buyer / supplier / transporter portals | `client/src/features/buyer`, backend `partners`, `procurement`, `transport` | Hidden (§2.1, §4.2) |
| 4-domain signup & login | Discussed, partly in `SignupPage` / `OnboardingWizard` | Mill only |
| AI chatbot + insights | `server/src/modules/ai`, `jobs/insights.js` | Hidden |
| Kiosk attendance | `workforce/kiosk*` | Hidden |
| Platform admin | `modules/platform` | Hidden |
| Custom role editor / scope / ranks | Settings → Roles | Hide the Roles page; fixed 6 roles |
| Material calculator / multi-level shirt BOM | `catalog` calculator | Hidden. Keep the yarn-per-metre BOM used by the "enough yarn?" check |

---

## 6. What we explain to judges (database in 1 minute)

**~20 tables, 6 groups:**

| Group | Tables |
|---|---|
| Mill & users | `organizations`, `memberships`, `roles` |
| Setup | `stages`, `machines`, `shifts`, `items`, `bom_lines` (yarn per metre + wastage) |
| Stock | `stock_lots` (each GRN line), `stock_movements` (ledger) |
| Orders & production | `orders`, `order_lines`, `work_orders`, `production_logs`, `machine_events` (breakdowns) |
| Quality & dispatch | `rolls`, `qc_inspections`, `dispatches`, `dispatch_rolls` (unique roll = no double dispatch) |
| People & money | `workers`, `attendance`, `wage_lines`, `invoices`, `payments`, `expenses` (supplier bills) |

Views: `v_stock`, `v_machine_board`, `v_order_cost`, `v_monthly_pnl`.

**One-minute script:**
> "Yarn comes in as stock lots, and every change is a stock movement. An order is split into work orders on machines, and workers log production. The last stage creates rolls; every roll is inspected, and only passed rolls can go on a dispatch — the database blocks the same roll twice. The dispatch creates the invoice, payments close it, attendance gives wages, and views calculate the cost of each order and the month's profit."

Multi-tenant RLS stays in the code. Mention it in **one sentence** ("each mill's data is isolated in the database, so more mills can use it later") — no demo needed.

---

## 7. Docs

| File | Action |
|---|---|
| **This file (`05_REDUCTION_PLAN.md`)** | Active plan |
| `01_OVERALL_PLAN.md` | Add a note at the top: "Reference only — active scope is 05_REDUCTION_PLAN.md". Don't update further |
| `02_BACKEND_EXECUTION.md` | Reference for the built code. Don't update further |
| `03_FRONTEND_EXECUTION.md` | Reference; only §11–12 screens that are in §4.4 matter |
| `04_MOBILE_APP_EXECUTION.md` | Archive (move to `docs/archive/`) |
| Product name | Decide once: **SAMETA** (frontend) or TexLink (docs). Use one name in UI, slides and README |

---

## 8. Order of work and owners

| Step | Work | Owner | Effort |
|---|---|---|---|
| 1 | Branch + tag `pre-reduction` | Vipul | 5 min |
| 2 | Backend scope list + unmount routers + skip jobs / listeners (§2.1–2.4) | Vipul | 1–2 h |
| 3 | 6 default roles + mill-only org creation (§2.5–2.6) | Vipul | 1 h |
| 4 | Seed: one mill, 6 users, 30 days, module switches, "now" state (§3) | Hrishikesh | 2–3 h |
| 5 | Nav + routes clean-up, remove AI labels, `homeFor` (§4.1–4.3) | Omkar | 2 h |
| 6 | Breakdown on machine board instead of maintenance page | Omkar + Hrishikesh | 1–2 h |
| 7 | Polish the order detail page + dashboard tiles (§4.3) | Omkar | 2–3 h |
| 8 | Run the backend tests; fix anything broken by unmounting | Vipul | 1 h |
| 9 | Demo dry runs (§9), fix bugs found | All | rest of the time |
| 10 | Docs note + archive mobile doc + one product name (§7) | Anyone | 30 min |

---

## 9. Acceptance checklist (= the demo)

Run with the reduced seed, logged in as the right role at each step.

- [ ] **Store:** receive 300 kg red cotton yarn, lot L-301, for ORD-0142 → stock goes up; low-stock warning clears
- [ ] **Office:** open a new order → "enough yarn?" says short → after the GRN it says "can start"
- [ ] **Supervisor:** assign ORD-0142 to W-3 and worker Anil for Shift A; mark today's attendance
- [ ] **Operator (phone):** start, add production twice → machine board shows the %; other machines show idle
- [ ] **Operator:** report a breakdown on D-1 → red on the board with reason and minutes → back to running
- [ ] **QC (phone):** 3 rolls → pass / rework / reject → lists show passed, failed, waiting
- [ ] **QC:** open the rejected roll → trace shows order, machines and shift
- [ ] **Office ("buyer calls"):** open ORD-0142 → status stepper, %, passed metres, expected date — answered without leaving the desk
- [ ] **Store:** dispatch passed rolls → scan the same roll again → blocked → invoice quantity = dispatched rolls
- [ ] **Office:** record the buyer's payment; a supplier bill is in Bills
- [ ] **Owner:** wages for last month from attendance · production per machine · cost of ORD-0142 · **this month's profit**
- [ ] No menu item, page or label leads to a removed feature
- [ ] All of the above 3 times in a row without errors

---

## 10. Risks and how to handle them

| Risk | Handling |
|---|---|
| Unmounting a router breaks a page that still calls it | Remove the nav item and route **together**; run through every remaining page once; check the browser network tab for 404s |
| Tests fail after unmounting (`server/test/*`) | Mark tests for hidden modules as skipped, not deleted |
| Seed still creates portal data | Search the seed for `partnerships`, `trips`, `purchase_orders`, `gate_entries` after the change — should be zero rows |
| Someone keeps building extras | Rule 0.2: any new work must point to a PDF scene in §1 |
| Judges ask "can other mills use it?" | "Yes — each mill's data is isolated with Postgres row-level security; onboarding a second mill is just signup." |
