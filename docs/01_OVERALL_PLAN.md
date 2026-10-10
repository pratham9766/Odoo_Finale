# TexLink — Overall Plan

> Multi-tenant B2B SaaS platform for the textile supply chain.
> Built for the **Textile Manufacturing System** hackathon problem (Everest Textile Mills).
>
> Related docs:
> - [02_BACKEND_EXECUTION.md](02_BACKEND_EXECUTION.md) — Node.js + Express + Supabase PostgreSQL execution plan
> - [03_FRONTEND_EXECUTION.md](03_FRONTEND_EXECUTION.md) — React + Vite execution plan

---

## Table of contents

1. [Summary](#1-summary)
2. [The problem](#2-the-problem)
3. [Problem → solution map](#3-problem--solution-map)
4. [Domains (org types)](#4-domains-org-types)
5. [Approach and principles](#5-approach-and-principles)
6. [Architecture](#6-architecture)
7. [Technology stack](#7-technology-stack)
8. [Separation levels and security](#8-separation-levels-and-security)
9. [Roles and RBAC](#9-roles-and-rbac)
10. [Business domains inside a tenant](#10-business-domains-inside-a-tenant)
11. [Feature list (what we build and what we show)](#11-feature-list-what-we-build-and-what-we-show)
12. [BOM, material requirement and wastage](#12-bom-material-requirement-and-wastage)
13. [Worker attendance and wages](#13-worker-attendance-and-wages)
14. [Data model overview](#14-data-model-overview)
15. [Workflows](#15-workflows)
16. [State machines](#16-state-machines)
17. [UI structure (portals)](#17-ui-structure-portals)
18. [Build plan and phases](#18-build-plan-and-phases)
19. [Team split](#19-team-split)
20. [Seed (dummy) data](#20-seed-dummy-data)
21. [Demo script](#21-demo-script)
22. [Out of scope](#22-out-of-scope)
23. [Glossary](#23-glossary)

---

## 1. Summary

**TexLink** is one platform where **mills, buyers, suppliers and transporters** each get their own secure workspace and connect to each other. Data entered once flows through the whole chain:

**yarn → gate → store → machines → QC → dispatch → truck → buyer → payment → profit**

| Domain | Who | What they get |
|---|---|---|
| 🏭 Manufacturer (Mill) | Everest Textile Mills and other mills | Full ERP: stock, BOM, production, QC, dispatch, attendance, wages, accounts, costing, AI |
| 🛒 Buyer / Vendor | Traders, garment units, shops, exporters | Place orders, live tracking, deliveries, bills, payments |
| 🧵 Supplier | Yarn, dye and chemical vendors | Receive POs, dispatch lots, invoices, quality feedback |
| 🚚 Transporter | Transport companies, drivers | Trips, fleet, driver app, proof of delivery, freight bills |
| 🛡️ Platform (TexLink admin) | Our team | Manage orgs, approve/suspend, usage, announcements |

**Main demo tenant:** Everest Textile Mills. Every scene in the problem statement must work end to end inside it.

---

## 2. The problem

Everest Textile Mills buys yarn, turns it into fabric through **spinning, weaving and dyeing**, checks fabric for defects and sells finished rolls. Many buyers order at once, each with its own fabric, colour, quantity and deadline. The factory runs in shifts.

| Area | Today |
|---|---|
| Raw material stock | Notebook |
| Machine and order status | Someone walks the floor |
| Quality checks | Paper slips |
| Buyer order updates | Phone calls |
| Attendance and wages | Register |

**Result:** orders get delayed, machines sit idle, and **nobody knows the real cost of a single roll of fabric**.

The six scenes we must solve:

1. **Yarn arrives at the gate**: record qty, type, colour and order; always know stock; warn before it runs low; check if a new order can start.
2. **Production floor, mid-shift**: which order is on which machine, how far along, which machines are idle; breakdowns, shift changes, worker moves; today's output.
3. **Fabric check**: defects (holes, colour mismatch, uneven weave); pass / rework / reject; every roll traceable to order and machine; passed / failed / waiting records.
4. **Buyer calls**: tell the buyer exactly where the order stands, without anyone walking to the floor.
5. **Loading the truck**: right rolls, right qty, right buyer, matching invoice; finished stock on the shelf; nothing dispatched twice.
6. **Owner closing the books**: cost per order, production per machine, wages paid; raw material bills, wages and buyer payments in one place; did the mill make money?

---

## 3. Problem → solution map

| # | Problem | TexLink solution | Domain |
|---|---|---|---|
| 1 | Yarn stock in a notebook | Gate entry + GRN (lot, type, colour, qty, rate, for-order) + stock ledger | Mill, Supplier, Transport |
| 2 | No low-stock warning | Reorder levels, alerts, days-left forecast | Mill |
| 3 | Can't tell if an order can start | Multi-level BOM with wastage → requirement explosion with stock netting → reserve / auto-PO | Mill, Supplier |
| 4 | Status by walking the floor | Live machine board (order, %, operator, idle/breakdown) over WebSockets | Mill |
| 5 | Breakdowns, shifts, worker moves untracked | Breakdown log + maintenance tickets, shifts, worker ↔ machine assignments | Mill |
| 6 | Today's production unknown | Production logs per machine / shift / worker | Mill |
| 7 | QC on paper slips | QR roll labels, digital inspection, pass / rework / reject, photos | Mill |
| 8 | Defects not traceable | Roll genealogy: order → machine → shift → worker → dye batch → yarn lot → supplier | Mill, Supplier |
| 9 | Buyer status by phone | Buyer portal with live status, public tracking link, notifications | Buyer |
| 10 | Wrong rolls / qty on the truck | Scan-to-dispatch with validation, packing list, invoice from scanned rolls | Mill, Buyer |
| 11 | Double dispatch / forgotten stock | DB unique constraint per roll, unmoved-stock alert | Mill |
| 12 | Truck status unknown | Trips, driver mobile updates, OTP proof of delivery | Transport, Buyer |
| 13 | Attendance and wages in a register | QR badge kiosk + supervisor grid, late/half-day/OT rules, wage run | Mill |
| 14 | Real cost per order unknown | Order costing: material + labour + machine + rework + wastage + freight | Mill |
| 15 | Did the mill make money? | Monthly P&L, receivables, payables, owner dashboard | Mill |
| 16 | 10 businesses would need 10 apps | One multi-tenant platform, configured per org | Platform |
| 17 | Data hard to analyse | AI chatbot (natural language → stats + charts) and insight cards | All |

---

## 4. Domains (org types)

```
                         ┌───────────────────────┐
                         │  PLATFORM (TexLink)   │  manages all orgs
                         └───────────────────────┘

 ┌──────────────┐  yarn   ┌──────────────────┐  fabric  ┌──────────────────┐
 │  SUPPLIER    │ ──────► │  MANUFACTURER    │ ───────► │  BUYER / VENDOR  │
 │ (yarn, dye,  │  PO/GRN │  (Mill: Everest) │  Order   │ (traders, garment│
 │  chemicals)  │ ◄────── │                  │ ◄─────── │  makers, shops)  │
 └──────────────┘ payment └────────┬─────────┘ payment  └──────────────────┘
                                   │                              ▲
                          ┌────────▼──────────────────────────────┴┐
                          │  TRANSPORTER (moves goods between all) │
                          └────────────────────────────────────────┘
```

| Domain | Modules turned on | Portal | Build level |
|---|---|---|---|
| Manufacturer | Everything | `/app` + `/floor` + `/kiosk` | ✅ Full |
| Buyer | Purchase orders, tracking, deliveries, bills, optional stock | `/buyer` | ✅ Light |
| Supplier | Incoming POs, dispatch lots, invoices, quality feedback | `/supplier` | ✅ Light |
| Transporter | Trip requests, fleet, driver app, POD, freight bills | `/transport` + `/driver` | ⚠️ Light (dispatch fields always; portal if time allows) |
| Platform | Orgs, approve/suspend, usage, announcements | `/admin` | ✅ Tiny |

`organizations.types` is an array, so one org can be several types (e.g. a mill that also sells yarn). The type decides which modules turn on, which portal opens after login and which default roles are created.

**One record, many views:**

| Record | Seller / sender sees | Buyer / receiver sees | Transporter sees |
|---|---|---|---|
| Order | Sales order + internal progress | Purchase order + status | — |
| Dispatch | Outgoing dispatch | Incoming delivery | Trip |
| Invoice | Sales invoice | Bill | — (freight bill is its own invoice) |

---

## 5. Approach and principles

1. **One platform, many tenants.** Each business is an organization. Postgres Row-Level Security isolates data.
2. **One record, many views.** Shared records are never copied, so they never get out of sync.
3. **Enter once, flow everywhere.** A production log updates the machine board, order %, buyer screen and costing.
4. **Status is calculated, never typed.** A status engine derives order status from data.
5. **Traceability by design.** Every roll links to its full history.
6. **Configurable, not custom-coded.** Stages, machines, shifts, defect types, BOMs, roles and modules are per-org settings.
7. **Permission-based RBAC with scope.** The owner decides who does what, and where.
8. **Mobile-first for the floor.** Operators, QC, gate staff and drivers use phones with large buttons.
9. **Ledgers, not overwrites.** Stock movements, attendance punches, payments and audit logs keep history.
10. **AI on top of clean data.** Read-only and tenant-locked.
11. **Build the core PDF flow first.** Multi-tenant B2B and AI multiply the core; they never replace it.

---

## 6. Architecture

### 6.1 System diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                               CLIENTS                                      │
│ Mill Office(/app) · Floor(/floor) · Kiosk(/kiosk) · Buyer(/buyer)          │
│ Supplier(/supplier) · Transport(/transport, /driver) · Admin(/admin)       │
│ Public tracking(/track/:token)                                             │
└───────────────┬───────────────────────────────────────┬────────────────────┘
                │ REST (Bearer JWT + x-org-id)           │ WebSocket
┌───────────────▼───────────────────────────────────────▼────────────────────┐
│             FRONTEND: React 18 + Vite (JavaScript, one app)                │
│ React Router · TanStack Query · Ant Design + Tailwind · Recharts           │
│ supabase-js (auth only) · socket.io-client · html5-qrcode · qrcode.react   │
└───────────────┬────────────────────────────────────────────────────────────┘
┌───────────────▼────────────────────────────────────────────────────────────┐
│             BACKEND: Node.js + Express (JavaScript, ESM)                   │
│ auth → tenant → can(permission) → inScope → validate → controller → service│
│                                                                            │
│ Modules: platform · identity · orgs · partners · catalog(items, BOM) ·     │
│ inventory · procurement · orders · production · maintenance · quality ·    │
│ dispatch · transport · gate · workforce · finance · reports · ai · notify  │
│                                                                            │
│ Event bus → status engine · notifier · socket emitter · audit              │
│ Cron → low stock · deadline risk · overdue · absent alerts · insights      │
│ pdfkit · Resend/Nodemailer · Claude API                                    │
└──────┬──────────────────────┬──────────────────────┬───────────────────────┘
       │ pg as app_user       │ pg as ai_reader       │ HTTPS
┌──────▼──────────────────────▼───────┐      ┌────────▼─────────┐
│ SUPABASE                             │      │ Claude API       │
│ PostgreSQL + RLS · Auth · Storage    │      │ NL→SQL, insights │
└──────────────────────────────────────┘      └──────────────────┘
```

### 6.2 Key architecture decisions

| Decision | Choice | Reason |
|---|---|---|
| Auth | Supabase Auth on the frontend, JWT verified by Node | Free email verification, magic links, password reset |
| DB access | Only Node talks to the DB | One place for rules, validation and audit |
| Tenant isolation | RLS + `set_config('app.org_id')` per request | The database enforces isolation, not only the code |
| DB roles | `app_user` (read/write, RLS), `ai_reader` (read-only, RLS; the SQL guard allows only reporting views) | The chatbot can never write or leak another tenant's data |
| Realtime | Socket.io rooms per org and per order | Simple, uses the same permission logic |
| Business events | In-process event bus | Modules stay loosely coupled |
| Order status | Derived by the status engine | Answers "where is my order?" automatically |
| Stock | Ledger (`stock_movements`), balance = SUM | Full history, analysable |
| Numbering | Per-org counters (`ORD-2026-0001`) | Each tenant has its own sequence |
| Files | Supabase Storage, path `org_id/...` | Isolated per tenant |

### 6.3 Request lifecycle

```
1. React: GET /api/v1/orders   headers: Authorization: Bearer <JWT>, x-org-id: <org>
2. auth      → verify Supabase JWT → req.user
3. tenant    → load membership, role, permissions, scope → req.ctx  (403 if not a member)
4. can()     → required permission present?
5. inScope() → stage / machine / shift inside the user's scope?
6. validate  → zod schema
7. service   → withTenant(ctx): BEGIN; set_config(app.org_id, app.user_id); queries (RLS); audit; COMMIT
8. bus.emit(event) → status engine / notifier / socket push
9. response  → { data, meta } or { error: { code, message } }
```

### 6.4 Realtime

```
Socket connect (JWT + orgId) → verify → join rooms:
  org:<orgId>  ·  org:<orgId>:role:<role>  ·  order:<orderId> (both parties)  ·  user:<userId>
Server emits: machine.updated · production.logged · order.status_changed · roll.qc_done
              trip.status_changed · attendance.updated · notification.new
Frontend: useSocketEvent → queryClient.invalidateQueries(...)
```

### 6.5 AI

```
Question → POST /api/v1/ai/chat
  → prompt with allowed view schemas (filtered by user permissions) + examples + today + history
  → Claude returns structured JSON {sql, chart, explanation}
  → sqlGuard (SELECT/WITH only, allowed views only, LIMIT, no comments/semicolons)
  → run as ai_reader, READ ONLY transaction, statement_timeout 5s, app.org_id from session
  → rows → Claude writes a short answer → UI shows answer + table + chart + "View SQL"
Cron (daily) → insight SQL rules → Claude writes 1–2 lines → ai_insights → dashboard cards
```

### 6.6 Deployment

| Part | Host | Key env |
|---|---|---|
| Frontend | Vercel / Netlify | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Backend | Render / Railway | `DATABASE_URL` (app_user), `AI_DATABASE_URL` (ai_reader), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (storage/admin only), `ANTHROPIC_API_KEY`, `EMAIL_API_KEY`, `CLIENT_URL` |
| Database | Supabase | SQL migrations in `db/migrations` |

---

## 7. Technology stack

| Area | Tech |
|---|---|
| Frontend | React 18, Vite, **JavaScript (no TypeScript)**, React Router v6, TanStack Query v5, Ant Design 5, Tailwind CSS, Recharts, dayjs, axios |
| QR | `qrcode.react` (labels, badges), `html5-qrcode` (camera scanning) |
| Backend | Node.js 20, Express, **JavaScript (ESM)**, `pg`, `zod`, `socket.io`, `node-cron`, `pdfkit`, `multer`, `jose` |
| Database | **Supabase PostgreSQL** with RLS, views, constraints |
| Auth | Supabase Auth |
| Storage | Supabase Storage |
| AI | Claude API via `@anthropic-ai/sdk` (model `claude-opus-5-5`; `claude-sonnet-5-5` if cost matters) |
| Email | Resend or Nodemailer |
| Seed data | `@faker-js/faker` (en_IN) + custom 90-day simulation |
| Deploy | Vercel (FE), Render/Railway (BE), Supabase (DB) |
| Tooling | ESLint, Prettier, Git (main / dev / feature branches), Postman / Bruno collection |

---

## 8. Separation levels and security

```
┌──────────── PLATFORM (TexLink admin) ───────────┐  org metadata only, no business data
└─────────────────────────────────────────────────┘
┌──── TENANT: Everest (private) ────┐   ┌──── TENANT: Shree Fabrics ────┐
│ Staff · RBAC · Machines · QC ·    │   │ Staff · their stock · their    │
│ Workers · Wages · Stock · Costs · │   │ accounts · reports             │
│ P&L · Settings · AI history       │   │                                │
│        ┌──────── SHARED B2B ──────┼───┼─────────┐                      │
│        │ Partnership · Order · PO · Dispatch · Trip · Invoice · Payment │
│        └──────────────────────────┼───┼─────────┘                      │
└───────────────────────────────────┘   └────────────────────────────────┘
                PUBLIC: /track/:token (one order status, no prices)
```

| Layer | Enforces |
|---|---|
| Supabase Auth | Who you are (verified email) |
| Tenant middleware + Postgres RLS | Which org's data you can touch |
| `can(permission)` | Which action you can do |
| `inScope()` | Where you can do it (stage, machine, shift, warehouse) |
| Field filter | Hides prices, costs and wages without 🔒 permissions |
| Audit log | Who did what, when, before/after |

**Cross-tenant privacy rule:** a buyer sees order-level data (status, qty, ETA, dispatched rolls, invoices). A buyer never sees the mill's costs, machines, workers or other buyers. A transporter sees trip data only, never goods prices.

---

## 9. Roles and RBAC

### 9.1 Model

**Permission** (one action, e.g. `dispatch.confirm`) → **Role** (bundle) → **Member** (user + org + role) → **Scope** (stages / machines / shifts / warehouses).

- Default roles are created per org type. The owner can edit them and create custom roles.
- **Rank** stops anyone assigning a role equal to or above their own (Owner 100 … Operator 20).
- 🔒 Confidential permissions (prices, costs, wages, profit) default to Owner and Accounts.
- **User ≠ Worker.** A user has a login. A worker has attendance and wages and may have no login. An operator is both (linked via `workers.user_id`).
- Empty scope = whole org. A scoped supervisor only sees their stages, machines and shifts.

### 9.2 Mill roles

| Role | Rank | Responsibilities | Scope | Cannot |
|---|---|---|---|---|
| Owner | 100 | Runs the business, final approvals, sees money | Whole org | — |
| Plant / General Manager | 90 | Daily operations across departments, manages staff below rank | Whole org | P&L, wages, cost reports (unless granted) |
| Production Manager | 80 | Plans production, capacity, deadlines | All stages | Prices, wages, finance |
| Shift Supervisor | 60 | Runs a stage/shift: assignments, attendance, breakdowns, approves entries | Own stages + shifts + machines | Users, prices, costs, wages, other stages |
| Machine Operator | 20 | Runs a machine, logs output, creates rolls, reports breakdowns | Assigned machine | Everything else |
| QC Head | 60 | Manages QC, overrides results, defect analysis | All | Prices, finance |
| QC Inspector | 40 | Inspects rolls | Assigned area | Overrides, finance |
| Store Keeper (raw) | 40 | GRN, material issue, stock counts | Raw stores | Dispatch, prices (optional) |
| Dispatch / FG In-charge | 40 | Finished stock, packing, scan-to-dispatch, transport booking | FG store | Invoice edits, costs |
| Purchase Officer | 50 | POs, supplier follow-up | All | Sales prices, wages |
| Sales / Order Coordinator | 50 | Buyers, orders, status answers, invoices (create) | All | Costs, wages, P&L |
| Accountant | 70 | Invoices, bills, payments, expenses, wage payout, P&L | Finance | Production edits, staff |
| HR / Attendance Clerk | 50 | Workers, attendance corrections, leave, wage run preparation | All workers | Wage payout approval |
| Maintenance Technician | 30 | Breakdown tickets | Assigned machines | Planning |
| Gate Security | 20 | Vehicle in/out, gate pass check | Gate | Everything else |
| Worker / Helper (no login) | — | Floor labour, attendance via QR badge | — | No login |

### 9.3 Mill permission matrix (defaults; the owner can change these)

| Area | Owner | GM | Prod Mgr | Supervisor | Operator | QC Head | QC Insp | Store | Dispatch | Purchase | Sales | Accounts | HR | Maint | Gate |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Staff & roles | ✅ | ✅* | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | workers | ❌ | ❌ |
| Settings | ✅ | ✅ | stages/machines | ❌ | ❌ | defect types | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | shifts | ❌ | ❌ |
| Partners | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | transporters | suppliers | buyers | view | ❌ | ❌ | ❌ |
| Gate register | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | view | view | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| GRN / stock | ✅ | ✅ | view | view | ❌ | ❌ | ❌ | ✅ | view | view | view | view | ❌ | ❌ | ❌ |
| BOM / calculator | ✅ | ✅ | ✅ | view | ❌ | ❌ | ❌ | view | ❌ | view | view | view | ❌ | ❌ | ❌ |
| Purchase orders | ✅ | approve | view | ❌ | ❌ | ❌ | ❌ | view | ❌ | ✅ | ❌ | view | ❌ | ❌ | ❌ |
| Orders | ✅ | ✅ | view | view | ❌ | view | ❌ | view | view | view | ✅ | view | ❌ | ❌ | ❌ |
| Prices 🔒 | ✅ | opt | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | purchase | sales | ✅ | ❌ | ❌ | ❌ |
| Planning | ✅ | ✅ | ✅ | own scope | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | view | ❌ | ❌ | ❌ | ❌ |
| Production log | ✅ | ✅ | ✅ | own scope | own machine | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Breakdown | ✅ | ✅ | ✅ | report/close | report | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | fix | ❌ |
| QC inspect | ✅ | ✅ | view | view | ❌ | ✅ + override | ✅ | ❌ | view | ❌ | view | ❌ | ❌ | ❌ | ❌ |
| Dispatch | ✅ | ✅ | view | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | view | ❌ | ❌ | verify |
| Invoices / payments | ✅ | view | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | bills view | create inv | ✅ | ❌ | ❌ | ❌ |
| Attendance | ✅ | ✅ | view | mark (scope) | self view | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | view | ✅ | ❌ | ❌ |
| Wages 🔒 | ✅ | ❌ | ❌ | ❌ | own payslip | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ pay | prepare | ❌ | ❌ |
| Cost / P&L 🔒 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| AI chat | full | ops | production | own area | ❌ | QC | ❌ | stock | dispatch | purchase | orders | finance | HR | ❌ | ❌ |

\* The GM manages roles below their own rank only.

### 9.4 Other domain roles

| Domain | Roles |
|---|---|
| Buyer | Owner · Purchase Manager · Store / Receiving (OTP on delivery, shortage reports) · Accounts |
| Supplier | Owner · Sales / Dispatch · Accounts |
| Transporter | Owner · Fleet Manager / Dispatcher · Driver (mobile, own trips only) · Accounts |
| Platform | Super Admin · Support Agent (business data only with org-granted access) |

---

## 10. Business domains inside a tenant

| # | Domain | Owns | Independence |
|---|---|---|---|
| 1 | Identity & Access | users, memberships, roles, permissions | 🟢 Separate (used by all) |
| 2 | Organization & Settings | organizations, stages, shifts, defect types, warehouses | 🟢 Separate |
| 3 | Partner Network | partnerships, contacts | 🟢 Separate |
| 4 | Catalog | items, BOM | 🟢 Separate |
| 5 | Inventory | lots, movements, reservations, receipts | 🟡 Linked to orders and production |
| 6 | Procurement | purchase orders | 🟡 Feeds inventory and finance |
| 7 | Sales & Orders | orders, order lines, events | 🟡 Central hub |
| 8 | Production | machines, work orders, logs, assignments | 🟡 Uses orders, inventory, workforce |
| 9 | Maintenance | machine events, tickets | 🟡 Uses production |
| 10 | Quality & Traceability | rolls, history, inspections, defects | 🟡 Uses production, feeds dispatch |
| 11 | Gate | gate entries | 🟡 Links trips, GRNs, dispatches |
| 12 | Dispatch | dispatches, dispatch rolls | 🟡 Uses QC, feeds finance and transport |
| 13 | Transport | vehicles, drivers, trips | 🟡 Uses dispatch |
| 14 | Finance | invoices, payments, expenses | 🟡 Uses dispatch, procurement, transport (🔒) |
| 15 | Workforce | workers, attendance, wages | 🟢 Almost separate; production reads "who worked where" (🔒) |
| 16 | Analytics & AI | views, chats, insights | 🔵 Read-only |
| 17 | Notifications & Audit | notifications, audit logs | 🔵 Cross-cutting |

```
Identity & Settings ─(used by all)        Partner Network ──► Orders
Catalog(BOM) ──► Inventory ◄── Procurement ◄── Supplier          │
                  │  ▲                                           ▼
       reserve/consume └── GRN ◄── Gate ◄── Transport     status events
                  ▼                                              ▲
Workforce ──► Production ──► Quality ──► Dispatch ──► Finance ───┘
                                            └──► Transport ──► Buyer
Analytics & AI ◄── reads everything        Notifications & Audit ◄── all events
```

Modules communicate through IDs and events, never by writing to each other's tables.

---

## 11. Feature list (what we build and what we show)

Legend: ⭐ Must (core PDF) · ➕ Should (our edge)

### 11.1 Inventory

| Feature | Priority | What we show |
|---|---|---|
| Item master with textile attributes (count, GSM, width, colour, unit, reorder level) | ⭐ | Items table, item form |
| GRN with lot, colour, qty, rate, for-order | ⭐ | GRN form; toast "Stock updated, ORD-0142 now material ready" |
| Stock ledger | ⭐ | Movements tab |
| Live raw stock + reserved vs. available | ⭐ | KPI cards (total, low items, reserved, finished fabric); table Item / Colour / In stock / Reserved / Available / Reorder / Days left / Status |
| Low-stock alert | ⭐ | 🔔 + red dashboard badge |
| Availability check via BOM explosion | ⭐ | Availability panel: required / in stock / reserved / available / short by → [Reserve] [Create PO] |
| Material issue to production | ⭐ | Auto on work order start |
| Finished goods stock | ⭐ | Roll / Order / Fabric / Colour / Length / Dye batch / Days on shelf |
| Stock adjustment with approval | ➕ | Adjustment form + audit |
| Days-left forecast | ➕ | Column + insight card |
| Unmoved stock alert | ➕ | Alert list |
| Scrap / waste stock | ➕ | Scrap items in stock |

### 11.2 Gate

| Feature | Priority | What we show |
|---|---|---|
| Vehicle in/out register | ➕ | `/floor/gate`: [Vehicle IN] [Vehicle OUT] → match → ✅ |
| Link truck to supplier dispatch → pre-filled GRN | ➕ | Matched dispatch card |
| Gate pass check for outgoing trucks | ➕ | Scan gate pass QR |

### 11.3 Procurement

| Feature | Priority | What we show |
|---|---|---|
| PO to supplier (connected or offline) | ⭐ | PO list: PO / Supplier / Items / Qty / Need by / Promise / Status |
| Auto-draft PO from shortage | ➕ | Button on the availability panel |
| Supplier performance | ➕ | On-time %, defect % from their lots |

### 11.4 Orders and tracking

| Feature | Priority | What we show |
|---|---|---|
| Order creation by mill or buyer | ⭐ | Order form |
| Many buyers at once, filters | ⭐ | Tabs All / In production / In QC / Ready / Dispatched / At risk |
| Auto status, progress %, current stage | ⭐ | Stage stepper + per-stage % |
| Order timeline | ⭐ | Event list with timestamps |
| ETA vs. deadline + risk flag | ➕ | 🟢🟡🔴 chip |
| Buyer live view | ⭐ | Buyer portal order page |
| Public tracking link | ➕ | `/track/:token` |
| Buyer notifications | ➕ | Email + in-app |

### 11.5 Production

| Feature | Priority | What we show |
|---|---|---|
| Configurable stages | ⭐ | Settings |
| Machine master | ⭐ | Machines table |
| Planning (order → work orders per stage → machines) | ⭐ | Kanban per stage, drag work order onto machine |
| Live machine board | ⭐ | KPI (running / idle / breakdown / today / utilisation) + machine cards by stage |
| Operator screen | ⭐ | Big buttons: + Add production · Create roll · Pause · Breakdown |
| Production logs | ⭐ | Per machine / shift / worker |
| Assignments | ⭐ | Worker ↔ machine ↔ shift |
| Actual output + waste capture | ⭐ | Finish dialog: good qty + waste qty |
| Utilisation % | ➕ | Production report |

### 11.6 Maintenance

| Feature | Priority | What we show |
|---|---|---|
| Breakdown report with reason | ⭐ | Reason picker on operator screen |
| Downtime per machine | ⭐ | Machine card timer, report |
| Tickets → technician → resolved | ➕ | Ticket list with status |
| Downtime by reason | ➕ | Pareto bar chart |

### 11.7 Quality

| Feature | Priority | What we show |
|---|---|---|
| Roll creation + QR label | ⭐ | Printable label |
| QC queue | ⭐ | Pending tab |
| Inspection: defects, count, severity, photo | ⭐ | `/floor/qc` station |
| Pass / Rework / Reject | ⭐ | Three big buttons |
| Rework loop | ⭐ | Rework work order → back to queue |
| Passed / Rework / Rejected lists | ⭐ | Tabs |
| QC override (audited) | ➕ | QC Head action |
| Defect analytics | ➕ | Bar by machine, pie by type, trend line |
| First-pass yield | ➕ | KPI |

### 11.8 Traceability

| Feature | Priority | What we show |
|---|---|---|
| Roll genealogy | ⭐ | `/app/rolls/:rollNo` timeline: yarn lot → spinning → weaving → dyeing → QC → order → buyer |
| Supplier quality feedback | ➕ | Supplier portal and supplier scorecard |

### 11.9 Dispatch

| Feature | Priority | What we show |
|---|---|---|
| Create dispatch | ⭐ | Form: order, buyer, vehicle, transporter |
| Scan rolls with validation | ⭐ | ✅ / ❌ list with reason (wrong order, not passed, already dispatched) |
| Qty check + partial dispatch | ⭐ | Ordered / Scanned / Remaining |
| Double-dispatch prevention | ⭐ | DB constraint error shown as ❌ |
| Packing list / challan PDF | ⭐ | Download |
| Invoice from scanned rolls | ⭐ | Invoice PDF |
| Dispatch history | ⭐ | List |

### 11.10 Transport

| Feature | Priority | What we show |
|---|---|---|
| Vehicle + driver fields on dispatch, mill updates status | ⭐ | Fields on dispatch |
| Trip request to connected transporter | ➕ | Transporter trip inbox |
| Assign vehicle + driver | ➕ | Fleet screens |
| Driver app status updates | ➕ | `/driver/trips/:id` |
| OTP + photo proof of delivery | ➕ | OTP entry, photo upload |
| Freight bill → order cost | ➕ | Freight invoice |

### 11.11 Attendance, wages, finance, reports, AI

| Feature | Priority | What we show |
|---|---|---|
| Worker master + QR badge | ⭐ | Worker profile, badge print |
| Kiosk check-in/out | ⭐ | `/kiosk` camera screen |
| Supervisor attendance grid | ⭐ | Grid workers × today |
| Late / half / OT rules | ⭐ | Status cells |
| Absent alert → reassign | ➕ | Supervisor board |
| Leave + corrections | ➕ | Approval lists |
| Monthly register | ⭐ | Workers × dates (P/A/H/L/OT) |
| Wage run (daily / hourly / piece) | ⭐ | Wage run table + totals |
| Payslip | ➕ | Per worker |
| Sales invoices, supplier bills, freight bills, payments, expenses | ⭐ | Finance lists with status badges |
| Receivables / payables + ageing | ⭐ | KPI + ageing chart |
| Owner dashboard | ⭐ | KPIs, charts, alerts, insight cards |
| Cost per order 🔒 | ⭐ | Revenue / material / labour / machine / rework / wastage / freight / profit / margin |
| Machine production report | ⭐ | Output, run, idle, downtime, utilisation, defect % |
| Attendance and wages reports | ⭐ | Tables + charts |
| Monthly P&L 🔒 | ⭐ | P&L statement, month comparison |
| Wastage report | ➕ | Planned vs. actual by stage / machine / order |
| AI chatbot | ➕ | Floating 🤖 + full page: answer + table + chart + View SQL |
| AI insight cards | ➕ | Dashboard cards |

### 11.12 Portals and platform

| Feature | Priority | What we show |
|---|---|---|
| Signup + onboarding wizard by org type | ⭐ | Step wizard |
| Connect code + email invite | ⭐ / ➕ | Partners page: code [Copy], requests, list |
| Staff + roles + scope | ⭐ | Staff table, role editor, scope picker |
| Org switcher | ⭐ | Topbar dropdown |
| Buyer portal | ⭐ | Orders, tracking, deliveries, bills |
| Supplier portal | ➕ | POs, dispatches, invoices, feedback |
| Transport portal + driver app | ➕ | Trips, fleet, POD, freight |
| Platform admin | ➕ | Orgs list, approve/suspend, usage |
| Notifications | ⭐ | 🔔 bell + list |
| Audit log | ➕ | Who / what / when / before-after |

---

## 12. BOM, material requirement and wastage

### 12.1 Idea

Work backward from the final product. Every stage loses material, so each stage needs more input than output.

```
👕 Shirt ← Finished fabric (+ cutting waste) ← Grey fabric (+ dyeing loss / shrinkage)
        ← Yarn (+ weaving waste) ← Fibre (+ spinning waste)
```

**Formula:** `input = output ÷ (1 − wastage%)`. Use divide, not multiply: 10% loss on 100 kg needs 111.1 kg, not 110 kg.

### 12.2 Worked example: 1 shirt

| Parameter | Value (example; each mill sets its own) |
|---|---|
| Fabric in 1 shirt | 1.6 m |
| Width | 58" = 1.47 m |
| Finished GSM | 120 g/m² |
| Cutting waste | 10% |
| Dyeing shrinkage / weight loss | 4% / 5% |
| Weaving waste | 3% |
| Spinning waste | 12% |

Weight per metre = 120 × 1.47 = **176.4 g/m**

| Stage | Calculation | Result |
|---|---|---|
| Shirt uses | 1.6 m × 176.4 g | 1.60 m = 282 g |
| Cutting (10%) | 1.6 ÷ 0.90 | 1.78 m finished = 314 g |
| Dyeing (4% / 5%) | 1.78 ÷ 0.96 ; 314 ÷ 0.95 | 1.85 m grey = 330 g |
| Weaving (3%) | 330 ÷ 0.97 | 340 g yarn (warp 55% = 187 g, weft 45% = 153 g) |
| Spinning (12%) | 340 ÷ 0.88 | 387 g fibre |

**1 shirt ≈ 387 g fibre → 340 g yarn → 1.85 m grey → 1.78 m finished → 1.6 m in the shirt.** Total loss ≈ 105 g (27%).

### 12.3 Order of 1,000 shirts with stock netting

The system uses existing stock first at each level and explodes only the shortage downward (MRP-style netting).

| Material | Gross need | Available | From stock | To produce / buy |
|---|---|---|---|---|
| Finished fabric | 1,778 m | 200 m | 200 m | Produce 1,578 m (278 kg) |
| Grey fabric | 1,644 m (293 kg) | 0 | 0 | Weave 1,644 m |
| Yarn 40s | 302 kg (warp 166 / weft 136) | 210 kg | 210 kg | Short 92 kg |
| Cotton fibre | 105 kg | 500 kg | 105 kg | ✅ OK |
| Reactive dye (2% shade) | 5.9 kg | 10 kg | 5.9 kg | ✅ OK |

### 12.4 Conversions

| Conversion | Formula |
|---|---|
| Fabric m → kg | `kg = m × width_m × GSM ÷ 1000` |
| Fabric kg → m | `m = kg × 1000 ÷ (width_m × GSM)` |
| Yarn count Ne → length | `m per kg = Ne × 1693.3` |
| Warp / weft | `share_pct` per BOM line |
| Dye | `dye kg = fabric kg × shade %` |
| Rolls ↔ m | `m = rolls × roll_length_m` (or actual lengths) |

### 12.5 Planned vs. actual wastage

- Work order start → material issued (`material_issues`).
- Work order finish → good output + waste qty (`work_order_outputs`).
- Actual waste % = `1 − output_weight / input_weight`.
- Wastage variance report per stage / machine / shift / order. Extra waste cost goes into the order cost. AI insight flags spikes.

---

## 13. Worker attendance and wages

### 13.1 What we track

Check-in / check-out per shift · status (Present, Absent, Half-day, Late, Leave, Weekly off, Holiday) · late minutes · early leave · overtime · machine worked on · production per worker · leave · advances · corrections.

### 13.2 Capture methods (all write the same tables)

| Method | Who | How |
|---|---|---|
| QR badge + gate kiosk ⭐ | Every worker | Gate tablet (`/kiosk`) scans the badge → IN/OUT with time + optional photo |
| Supervisor grid | Shift supervisor | Mark all present → edit exceptions (backup, contract labour) |
| Self check-in | Workers with a login | Button on `/floor` (optional) |

### 13.3 Rules

- Shifts: A 06:00–14:00, B 14:00–22:00, C 22:00–06:00, grace 10 min (configurable).
- After grace → Late. Worked < half shift → Half-day. Worked > shift → Overtime (needs approval).
- No punch by shift start + 30 min → absent alert to supervisor.
- Missing check-out → flagged for correction.
- Night shift: attendance date = shift start date.
- Corrections never overwrite punches; they are logged with the approver.

### 13.4 Flow

```
Kiosk scan 06:04 → Present (Shift A)
  → supervisor board "Present 46/50" → assign workers to machines (absent → reassign)
  → operator logs production (worker, machine, shift, qty)
  → check-out 14:12 → hours, OT
  → month end wage run:
      daily  = days × rate + half-days × rate/2
      hourly = hours × rate + OT × OT rate
      piece  = qty × piece rate
      − advances − deductions = net
  → HR prepares → Accountant approves & pays → payslip
  → labour cost allocated to orders by machine time
```

---

## 14. Data model overview

| Domain | Tables |
|---|---|
| Platform | `platform_admins`, `plans`, `announcements` |
| Identity & RBAC | `profiles`, `memberships` (role_id, scope, reports_to), `roles`, `permissions`, `role_permissions`, `staff_invites` |
| Organization | `organizations` (types[], connect_code, status, settings), `org_counters`, `stages`, `defect_types`, `warehouses`, `stage_losses` |
| Partner network | `partnerships`, `partner_invites`, `contacts` |
| Catalog | `items` (kind, gsm, width_m, yarn_count_ne, colour, uom, reorder_level, std_rate), `boms`, `bom_lines` |
| Inventory | `stock_lots`, `stock_movements`, `reservations`, `goods_receipts`, `receipt_lines` |
| Procurement (shared) | `purchase_orders`, `po_lines` |
| Orders (shared) | `orders`, `order_lines`, `order_events` |
| Production | `machines`, `work_orders`, `production_logs`, `work_order_outputs`, `material_issues`, `assignments` |
| Maintenance | `machine_events`, `maintenance_tickets` |
| Quality | `rolls`, `roll_history`, `roll_yarn_lots`, `qc_inspections`, `qc_defects` |
| Gate | `gate_entries` |
| Dispatch (shared) | `dispatches`, `dispatch_rolls` (UNIQUE roll_id), `dispatch_lots` |
| Transport (shared) | `vehicles`, `drivers`, `trips`, `trip_events` |
| Workforce | `workers`, `shifts`, `attendance_punches`, `attendance`, `attendance_corrections`, `leave_requests`, `holidays`, `wage_advances`, `wage_runs`, `wage_lines`, `kiosk_devices` |
| Finance (shared) | `invoices` (kind: sales / freight), `invoice_lines`, `payments`, `expenses` |
| System | `notifications`, `audit_logs`, `ai_chats`, `ai_messages`, `ai_insights` |
| Views | `v_stock`, `v_low_stock`, `v_finished_stock`, `v_machine_board`, `v_production_daily`, `v_order_progress`, `v_qc_summary`, `v_defects_by_cause`, `v_wastage`, `v_attendance_daily`, `v_wages_monthly`, `v_order_cost`, `v_receivables`, `v_payables`, `v_trip_status`, `v_monthly_pnl` |

**Order cost** = material (actual lot cost of issued material) + labour (allocated worker hours × rate) + machine overhead (run hours × hourly cost) + rework / reject loss + extra wastage + freight.

Full schema and SQL: see [02_BACKEND_EXECUTION.md](02_BACKEND_EXECUTION.md).

---

## 15. Workflows

### 15.1 End-to-end master flow

```
BUYER            MILL                               SUPPLIER        TRANSPORT
  │ place order ─►│ requirement explosion (BOM + stock)
  │               │ short → PO ─────────────────────►│ accept PO
  │               │                                  │ dispatch lots ─► trip request
  │               │                                  │                 │ assign truck + driver
  │               │◄──────────── truck at gate ──────┼─────────────────┤ in transit → reached
  │               │ gate entry → pre-filled GRN      │                 │
  │               │ stock ↑ → material ready         │◄─ bill ─────────┤ freight bill
  │ live status ◄─│ attendance → assignments → plan → production logs
  │               │ rolls + QR → QC (pass / rework / reject)
  │ "Ready" 🔔  ◄─│ dispatch scan → invoice → trip request ───────────►│ accept, assign
  │               │ gate out                                           │ picked up → in transit
  │ OTP to driver ┼────────────────────────────────────────────────────► delivered
  │ pay invoice ─►│ payment → receivables ↓                            │ freight bill → mill
  │               │ month end: wages, cost per order, P&L, AI insights
```

### 15.2 Onboarding

1. Sign up → verify email.
2. Wizard: org details + type → type-specific setup (mill: stages, machines, shifts, items, BOM defaults; transporter: vehicles, drivers) → invite staff.
3. System creates org, connect code, default roles for the type, owner membership, default defect types and stage losses.
4. Platform admin approves (optional toggle). User lands in the right portal.

### 15.3 Staff and roles

Owner → Settings → Staff → invite (email, role, scope, reports-to) → email → accept → membership. Settings → Roles: permission checklist by domain with 🔒 marks. Every change is audited.

### 15.4 Partner connection

Org A enters org B's connect code (or email invite) and picks the relation (buyer / supplier / transporter) → B gets 🔔 → accept → `active`. Only active partners exchange orders, POs, dispatches and trips. Offline partners stay as contacts.

### 15.5 Order and requirements

1. Buyer (or mill sales) creates the order.
2. Requirements tab runs BOM explosion with stock netting.
3. Confirm → reserve available stock → `material_ready`, or shortage → auto-draft PO → `waiting_material`.
4. Buyer sees status live.

### 15.6 Procurement → gate → GRN

1. Purchase officer sends PO → supplier accepts and promises a date.
2. Supplier creates a dispatch (lots, colour, qty) and picks a transporter → trip request.
3. Transporter assigns vehicle + driver; driver updates status.
4. Gate security logs the vehicle and links the expected dispatch.
5. Store keeper posts the pre-filled GRN (records shortages) → lots, stock in, reservations for waiting orders, supplier bill + freight bill drafts.
6. Waiting orders are re-checked → `material_ready` → 🔔 production manager.

### 15.7 Attendance and shift start

Kiosk punches → absent alerts at shift start + 30 min → supervisor reassigns → check-out → hours / OT → OT approval.

### 15.8 Production

1. Production manager plans: order line → work orders per stage with grossed-up targets → machines.
2. Supervisor confirms worker ↔ machine assignments.
3. Operator Start → material issued from reserved lots → machine running → order `in_production`.
4. + Add production → logs → % ↑ → board, order and buyer update live.
5. Breakdown → reason → maintenance ticket → technician resolves → downtime recorded → deadline-risk re-check.
6. Finish → good qty + waste qty → next stage's work order becomes ready.

### 15.9 Rolls, QC, traceability

1. Final stage: Create roll → QR label → genealogy saved automatically.
2. QC scans → defects + photo → Pass (finished stock) / Rework (rework work order → queue again) / Reject (loss, remaining qty ↑).
3. QC Head reviews defect analytics; supplier sees feedback on their lots.

### 15.10 Dispatch, transport, delivery

1. Dispatch in-charge creates a dispatch → scans rolls (same order, passed, not dispatched) → packing list.
2. Picks a transporter → trip request → transporter assigns vehicle + driver.
3. Confirm → rolls locked → invoice generated from scanned rolls → buyer gets incoming delivery, bill and delivery OTP.
4. Gate logs truck out.
5. Driver: picked up → in transit → reached → enters buyer OTP + photo → delivered.
6. Buyer confirms (or reports shortage / damage) → order `delivered`.
7. Transporter raises freight bill → added to order cost.

### 15.11 Payments

Buyer pays → invoice partial / paid, visible to both sides. Mill pays supplier and freight bills. Cron flags overdue invoices.

### 15.12 Month end

1. Wage run: HR prepares → Accountant approves → paid → payslips.
2. Expenses entered.
3. Owner opens P&L: revenue − material − wages − overhead − freight − expenses = profit; receivables / payables.
4. Drill-down: cost per order, machine production, wastage, attendance, wages.
5. AI: "Why was October profit lower than September?"

### 15.13 Platform admin

New org → optional approval → monitor usage → suspend abusive orgs → announcements.

---

## 16. State machines

```
PARTNERSHIP  pending → active → blocked | rejected
ORDER        draft → confirmed → waiting_material ⇄ material_ready → in_production → in_qc
             → ready_to_ship → partially_dispatched → dispatched → delivered → closed (| cancelled)
PO           draft → sent → accepted | partially_accepted | rejected → dispatched → received → closed
WORK ORDER   planned → running ⇄ paused → done
MACHINE      idle ⇄ running ; → breakdown → idle ; → maintenance → idle
TICKET       open → in_progress → resolved
ROLL         produced → pending_qc → passed → packed → dispatched → delivered
                                   ├→ rework → pending_qc
                                   └→ rejected
DISPATCH     packing → confirmed (locked) → in_transit → delivered | disputed
TRIP         requested → accepted → assigned → picked_up → in_transit → reached → delivered (| rejected)
ATTENDANCE   punch in → present | late → punch out → closed ; absent / half / leave / corrected
WAGE RUN     draft → approved → paid
INVOICE      unpaid → partial → paid ; overdue (past due date)
```

---

## 17. UI structure (portals)

| Portal | Route | Layout | Device | Users |
|---|---|---|---|---|
| Landing + auth | `/`, `/login`, `/signup`, `/invite/:token` | PublicLayout | All | Everyone |
| Onboarding | `/onboarding` | Wizard | Desktop | New org owner |
| Mill office | `/app/*` | AppLayout (sidebar + topbar) | Desktop | Owner, managers, office |
| Floor | `/floor/*` | FloorLayout (bottom nav, big buttons) | Phone / tablet | Supervisor, operator, QC, store, maintenance, gate |
| Kiosk | `/kiosk` | Full-screen | Gate tablet | Workers (device token) |
| Buyer | `/buyer/*` | PortalLayout | Desktop + phone | Buyer org |
| Supplier | `/supplier/*` | PortalLayout | Desktop + phone | Supplier org |
| Transport / Driver | `/transport/*`, `/driver/*` | PortalLayout / DriverLayout | Desktop / phone | Transporter, driver |
| Platform admin | `/admin/*` | AdminLayout | Desktop | TexLink team |
| Public tracking | `/track/:token` | Minimal | Phone | Anyone with the link |

After login: pick org (or auto-select) → portal chosen by org type + role (operator → `/floor/machine`, driver → `/driver/trips`, buyer → `/buyer/orders`).

Full routes, components and screen specs: see [03_FRONTEND_EXECUTION.md](03_FRONTEND_EXECUTION.md).

---

## 18. Build plan and phases

| Phase | Scope | Done when |
|---|---|---|
| 0. Setup | Monorepo, Supabase, env, lint, deploy skeleton | FE + BE live and connected to DB |
| 1. Platform foundation | Tenancy + RBAC tables, RLS, DB roles, auth / tenant / can / inScope middleware, signup, onboarding, org switcher, portal routing, staff invite, roles editor, mini admin | Two orgs isolated (tested); scoped supervisor sees only their scope |
| 2. Masters + seed v1 | Stages, machines, shifts, items with textile attributes, multi-level BOM, stage losses, workers + QR badges; seed orgs of all 5 types | Everest fully configured |
| 3. Partners, orders, procurement, inventory | Connect code / email, buyer orders, BOM explosion + netting, reservations, POs, supplier portal, gate, pre-filled GRN, ledger, low stock | Buyer order → shortage → PO → supplier dispatch → gate → GRN → material ready |
| 4. Attendance | Kiosk, supervisor grid, rules, absent alerts, corrections, leave, register | Kiosk punch → today board → absent alert |
| 5. Production + maintenance | Planning, assignments, operator screen, logs, output + waste, live board, tickets, status engine | Operator logs → board + buyer update live |
| 6. QC + traceability | Rolls + QR, QC station, rework, analytics, trace page, supplier feedback | Reject → trace to machine, worker, lot, supplier |
| 7. Dispatch + transport | Scan-to-dispatch, invoice, transporter portal, fleet, trips, driver app, OTP, freight bill, gate out | Double scan blocked; OTP completes delivery |
| 8. Finance + wages + reports | Invoices, bills, payments, expenses, wage run, order cost, wastage, machine / QC / attendance reports, P&L, owner dashboard | P&L ties out to invoices and expenses |
| 9. Seed v2 (90-day simulation) | Full history with planted patterns | Dashboards look real |
| 10. AI | Views, guard, chat (permission-aware), insight cards | 10 demo questions answered correctly |
| 11. Polish + demo | States, mobile QA, notifications, demo accounts, script, backup video, README | Demo runs cleanly 3 times in a row |

**Rule:** don't start ➕ features until the ⭐ flow runs end to end with seed data.

---

## 19. Team split

| Person | Owns |
|---|---|
| A — Platform & backend lead | Schema, RLS, RBAC, middleware, event bus, status engine, orders / procurement / BOM APIs, security review |
| B — Frontend lead | Design system, layouts, portal routing, mill office screens, dashboards, reports UI, platform admin |
| C — Floor & logistics | Kiosk + attendance, floor screens (operator, supervisor, QC, store, gate), QR, dispatch scan, transport portal + driver app, PDFs |
| D — Data, finance & AI | Seed simulation, reporting views, costing, wastage, wage run, P&L, buyer + supplier portals, AI chat + insights, demo script |

Working rules:
- Branches: `main` (always demo-able) ← `dev` ← `feature/<domain>`.
- Agree the API contract (request / response JSON) before building screens; the frontend uses mock JSON until the API exists.
- Build every feature against seed data.
- Definition of done: API + validation + RLS-safe + permission-checked + UI loading / empty / error states + mobile (floor screens) + part of the demo flow.
- Daily 15-minute sync: is the end-to-end flow still green?

---

## 20. Seed (dummy) data

- **Orgs:** Everest Textile Mills + 1 more mill (to prove isolation), 10 buyers (Surat, Tiruppur, Ludhiana, Bhiwandi, Panipat…), 3 suppliers (one with bad lots), 2 transporters. All partnerships active except one pending.
- **Everest:** 3 stages, 20 machines (S-1..6, W-1..8, D-1..6), 3 shifts, 15 users covering every mill role, about 60 workers with QR badges, about 12 yarn items, 8 fabric items, BOMs and stage losses.
- **90 days of simulated activity:** attendance punches (lates, absences, OT), POs, GRNs, about 150 orders, work orders, logs, outputs + waste, breakdowns + tickets, about 2,000 rolls + QC, about 80 dispatches + trips, invoices, payments, wage runs, expenses.
- **Planted patterns for the AI to find:**
  - W-3 has about 18% colour mismatch (others about 4%)
  - Supplier X lots cause more holes
  - Night shift produces about 15% less and has more lates
  - W-3 weaving waste 5–7% vs. 3% standard
  - 3 orders at deadline risk now
  - One yarn near reorder level
  - Two buyers with overdue invoices
  - One machine in breakdown now
  - One transporter often late
- **Demo logins** for every role in every domain.
- Values must be consistent (generated by simulation): yarn issued matches fabric produced after wastage; invoices match dispatches; wages match attendance.

---

## 21. Demo script (about 8 minutes)

1. **Pitch (30 s):** "One platform for the textile supply chain: mill, buyers, suppliers, transporters."
2. **Kiosk:** a worker scans their badge → present. Supervisor board shows an absent operator → reassign.
3. **Buyer** (second screen) places an order for 1,000 shirts' worth of fabric → mill Requirements tab explodes the BOM with wastage → shortage → PO to supplier.
4. **Supplier** accepts and dispatches → **transporter** driver updates → **gate** entry → pre-filled GRN → material ready.
5. **Production:** operator logs on a phone → machine board and buyer screen update live. Breakdown → ticket.
6. **QC:** scan → pass / rework / reject → trace the rejected roll to the supplier's lot.
7. **Dispatch:** scan rolls → try a duplicate → blocked → invoice → trip → driver enters the buyer OTP → delivered.
8. **Owner:** cost of this order (including wastage and freight), wages from attendance, monthly P&L.
9. **AI:** "Why are defects high this month?" → W-3 + Supplier X with a chart.
10. **RBAC:** log in as supervisor → no prices or profit. Buyer → can't see mill costs. Platform admin → org list.

---

## 22. Out of scope

- GPS live tracking (manual trip status only)
- Biometric / face-recognition attendance (QR + photo is enough)
- Real subscription billing / payment gateway
- Job-work domain as a separate tenant (future slide)
- IoT machine sensors, ML forecasting, blockchain
- GST filing, statutory payroll (PF / ESI)
- Native mobile apps (responsive web covers it)

---

## 23. Glossary

| Term | Meaning |
|---|---|
| Tenant / Org | One business on the platform |
| RLS | Row-Level Security: Postgres rules that filter rows per tenant |
| RBAC | Role-based access control |
| Scope | Limits a member to certain stages, machines, shifts or warehouses |
| GRN | Goods receipt note: record of material received |
| PO | Purchase order |
| BOM | Bill of materials: recipe of inputs per output, with wastage |
| MRP netting | Use stock first at each BOM level, explode only the shortage |
| GSM | Grams per square metre of fabric |
| Ne | English cotton count (yarn fineness) |
| Grey fabric | Woven fabric before dyeing / finishing |
| Lot | A received batch of material with one supplier, colour and rate |
| Dye batch | One dyeing run; shades can vary between batches |
| Work order | One stage of production for one order line on one machine |
| Roll | Unit of finished fabric with a unique number and QR |
| POD | Proof of delivery (OTP + photo) |
| FG | Finished goods |
| OT | Overtime |
| P&L | Profit and loss statement |
