# Sameta

**Textile mill operations, from yarn to delivery.** Built for the Odoo × NMIT Hackathon 2026.

Sameta runs one textile mill end to end: buyer orders, yarn receipts and stock, machine production, quality control of fabric rolls, dispatch and invoicing, attendance and wages, and the mill's accounts. Every screen works on live data in Postgres; there is no mock data.

The problem statement is in [`Textile_Manufacturing_System.pdf`](Textile_Manufacturing_System.pdf).

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [API overview](#api-overview)
- [Access control](#access-control)
- [Testing](#testing)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)

---

## Features

| Area | What it covers |
|---|---|
| **Sales** | Orders with multiple fabric/colour/quantity lines and deadlines. Order status is derived from production, QC and dispatch. Buyers and suppliers are kept as contacts. |
| **Stores** | Goods receipts by lot (yarn type, colour, supplier, rate), stock with reservations and low-stock alerts, items, and recipes (BOMs) with wastage. |
| **Production** | Live machine board, work orders, operator/shift assignments, production logs, breakdowns and maintenance. |
| **Quality & dispatch** | Uniquely numbered rolls linked to order, machine and yarn lot; inspections with defects and pass/rework/reject; roll genealogy; dispatch of passed rolls with an invoice per dispatch. |
| **People** | Workers, attendance (night shifts count toward the day they start), and wage runs on daily, hourly or piece rates. |
| **Money** | Invoices, payments, expenses and receivables; reports for order cost, P&L, machine output, wastage, QC, attendance and wages, with PDF/CSV export. |
| **Admin** | Staff invites by email, custom roles with per-module view/create/update/delete permissions, and mill settings. |
| **Buyer tracking** | A public `/track/:token` link shows a buyer their order's progress without costs or worker details. |
| **Realtime** | Socket.io notices on mill changes; clients refetch through the API. Scheduled jobs flag deadline risk and low stock. |

## Architecture

```
Browser (React SPA, :5173)
   │  1. sign in ──────────────► Supabase Auth  (returns a JWT)
   │  2. REST /api/v1 + Bearer JWT
   │  3. socket.io (same JWT)
   ▼
Express API (:4000)
   ├─ auth        verify JWT against Supabase JWKS
   ├─ staff       must be an active staff member with a role
   ├─ rbac        per-route permission check
   ├─ validate    zod schemas for params / query / body
   ├─ modules     orders, inventory, production, quality, dispatch, workforce, finance, reports …
   ├─ events      in-process bus → status engine, stock/quality reactions, notifier, socket emitter
   └─ jobs        node-cron: deadline risk, low stock
   │  parameterized SQL (pg), one transaction per request
   ▼
Supabase Postgres (via Supavisor pooler) + Supabase Storage (files)
```

- The browser uses Supabase **only to sign in**. All data goes through the API.
- The API connects as a restricted `app_user` role. Migrations and the seed use the `postgres` role.
- A modular monolith: one API process, one database, no microservices.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 6, React Router 7, TanStack Query 5, Ant Design 5, Tailwind CSS 4 |
| Backend | Node.js, Express 5, zod 4, pg, socket.io, node-cron, helmet, express-rate-limit |
| Data & auth | Supabase Postgres, Supabase Auth (JWT via `jose`), Supabase Storage |
| Documents & mail | pdfkit, qrcode, nodemailer (SMTP) |
| Tests | `node:test`, supertest |

## Repository layout

```
.
├── client/                 React frontend
│   ├── src/
│   │   ├── features/       one file per screen (Orders, Stock, Production, Quality, Dispatch, …)
│   │   ├── components/     shared UI (States, NotificationBell, Icons, operations/)
│   │   ├── layouts/        AppLayout (office), FloorLayout (tablet shop floor)
│   │   ├── context/        Session: Supabase session + /me/access permissions
│   │   ├── lib/            api client, contracts, formatting helpers
│   │   └── styles/
│   └── test/
├── server/                 Express API
│   ├── src/
│   │   ├── modules/        <area>/<area>.{routes,schema,service}.js
│   │   ├── middleware/     auth, staff, rbac, validate, rateLimit, errorHandler
│   │   ├── events/         event bus and listeners
│   │   ├── jobs/           scheduled jobs
│   │   ├── realtime/       socket.io
│   │   ├── db/             pg pool and transaction helper
│   │   └── utils/          pdf, csv, email, storage, numbering, money, time …
│   └── test/
├── db/
│   ├── migrations/         001–022 SQL files, applied once each by full file name (019 and 020 exist twice: see docs/MIGRATIONS.md)
│   └── seed/               masters + simulated history, run through the real services
└── docs/                   plans, contracts and verification notes
```

## Getting started

### Prerequisites

- **Node.js 22.12 or newer** (the client requires it; the server needs 20+)
- A **Supabase** project (Postgres, Auth and Storage)
- Optional: an SMTP account (for example a Gmail app password) to email staff invites

### 1. Install

```bash
cd server && npm install
cd ../client && npm install
```

`db/` has no dependencies of its own; it uses `server/node_modules`.

### 2. Configure

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env.local
```

Fill in the values described under [Environment variables](#environment-variables).

### 3. Create and seed the database

Run from `server/`:

```bash
npm run migrate                 # apply db/migrations/*.sql
npm run reset -- --yes          # empty the tables and seed the demo mill with history
```

### 4. Run

```bash
# terminal 1, in server/
npm run dev                     # API on http://localhost:4000 (check /health)

# terminal 2, in client/
npm run dev                     # app on http://localhost:5173
```

### 5. Sign in

The seed creates one owner login for the demo mill. The email and password are in [`docs/08_LOCAL_DEMO_ACCOUNTS.md`](docs/08_LOCAL_DEMO_ACCOUNTS.md). As the owner:

1. **Roles & permissions:** create the roles the mill needs.
2. **Staff:** invite people by email and give them a role. Without SMTP, the invite link is shown on screen and printed in the server console.
3. Floor roles land on the tablet screens under `/floor`; everyone else lands on the dashboard.

## Environment variables

### `server/.env`

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | no | API port. Default `4000`. |
| `NODE_ENV` | no | `development`, `production` or `test`. |
| `CLIENT_URL` | **yes** | Frontend origin allowed by CORS and socket.io, for example `http://localhost:5173`. |
| `SUPABASE_URL` | **yes** | Project URL. Used to verify JWTs and for Storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Server-only key for Auth admin and Storage. **Never put it in the client.** |
| `SUPABASE_JWT_SECRET` | no | Fallback for projects that still sign with the legacy JWT secret. |
| `DATABASE_URL` | **yes** | App connection as `app_user.<ref>` through the pooler, transaction mode, port `6543`. |
| `MIGRATION_DATABASE_URL` | for migrate/seed | `postgres.<ref>` through the pooler, session mode, port `5432`. |
| `APP_USER_PASSWORD` | for migrate | Password `migrate` gives the `app_user` role; it must match the one in `DATABASE_URL`. |
| `PUBLIC_TRACK_BASE_URL` | **yes** | Base of buyer tracking links, for example `http://localhost:5173/track`. |
| `JOBS_ENABLED` | no | `false` turns off the scheduled jobs (useful in tests). Default `true`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | no | Mail for staff invites. Leave empty to print invite links instead. |
| `EMAIL_FROM` | no | Sender name and address for emails. |

Use the Supavisor pooler hosts (`aws-0-<region>.pooler.supabase.com`). The direct `db.<ref>.supabase.co` host is IPv6-only and can fail DNS.

### `client/.env.local`

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API origin, for example `http://localhost:4000`. |
| `VITE_SUPABASE_URL` | Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Public anon key. Only this key belongs in the frontend. |
| `VITE_PASSWORD_RESET_URL` | Public reset-password route registered in Supabase Auth, for example `http://localhost:5173/reset-password`. |

Without the Supabase values, the app shows setup instructions instead of the login screen.

## Scripts

### `server/`

| Command | What it does |
|---|---|
| `npm run dev` | Start the API with auto-reload (nodemon). |
| `npm start` | Start the API. |
| `npm run migrate` | Apply pending migrations. `-- --status` lists applied/pending; `-- --local` targets a plain local Postgres. |
| `npm run seed` | Seed the mill and replay its history through the real services. `-- --masters` seeds masters only (seconds); `-- --days=14` shortens the history. |
| `npm run reset -- --yes` | **Empty every table** and seed again. `--no-seed` only empties; `--days=N` is passed to the seed. |
| `npm test` | Run the server tests. |
| `npm run lint` | ESLint over `src/`. |

The seed runs every simulated day through the real services, so over a remote database it takes a few minutes per day. Use `--days` for a quick setup.

### `client/`

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `127.0.0.1:5173`. |
| `npm run build` | Production build into `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm test` | Run the client tests. |

## API overview

Base path: `/api/v1`. Successful responses are `{ "data": …, "meta"?: … }`. Errors are `{ "error": { "code", "message", "details"? } }` with status 400 validation, 401 not signed in, 403 forbidden, 404 not found, 409 conflict or 422 business rule.

| Route group | Auth | Notes |
|---|---|---|
| `GET /health` | none | Liveness check. |
| `/api/v1/public/*` | none, rate-limited | Buyer order tracking and invite preview/accept. |
| `/api/v1/me/*` | signed in | Profile and the caller's role and permissions (`GET /me/access`). |
| `/api/v1/*` | signed in, active staff | Staff, contacts, catalog, inventory, procurement, orders, notifications, mill, production, maintenance, quality, dispatch, workforce, finance, reports. |

The field-level contract the frontend relies on is in [`docs/05_FRONTEND_CONTRACT.md`](docs/05_FRONTEND_CONTRACT.md).

## Access control

- **Authentication:** Supabase issues the JWT; the API verifies it against the project's JWKS on every request and socket connection.
- **Authorization:** each staff member has one role, and each role has permissions such as `orders.view` or `dispatch.confirm`. The server checks permissions on every route; the client only hides what the user cannot use.
- **Database:** the API connects as a restricted role and uses parameterized queries inside a transaction per request.
- **Public data:** the tracking link exposes only the buyer's order summary, never costs or worker details.

## Testing

```bash
cd server && npm run lint
cd server && npm test        # offline: rules, schemas, PDFs, planning (needs a server/.env only to satisfy the environment check; touches no database)
cd server && SAMETA_TEST_ADMIN_URL=postgresql://postgres:<password>@127.0.0.1:5432/postgres npm run test:db
                             # database-backed: real transactions, locks, idempotency, dispatch races, attendance + payroll, migrations, seed
cd client && npm test        # api client, contracts and order helpers
cd client && npm run build   # production build check
cd mobile && npm run check && npm test   # mobile: imports resolve, token refresh, pending entries, attendance times
```

`test:db` needs a **local, disposable** PostgreSQL superuser URL (never Supabase or a shared database: the harness refuses non-local hosts). It creates a new database per test file, migrates it with the real `db/migrate.js`, and drops it afterwards. Without `SAMETA_TEST_ADMIN_URL` those tests are skipped.

## Deployment

- **Frontend (Vercel):** root directory `client`, build `npm run build`, output `dist`. `client/vercel.json` already rewrites all routes to `index.html`. Set the three `VITE_*` variables.
- **API (Render, Railway or similar):** root `server`, start `npm start`, Node 22. Set the server variables, with `CLIENT_URL` and `PUBLIC_TRACK_BASE_URL` pointing at the deployed frontend. The app trusts one proxy hop so rate limiting sees real client IPs.
- **Supabase:** add the deployed frontend URL to Auth redirect URLs, then run `npm run migrate` against the production database.

## Documentation

| File | Contents |
|---|---|
| [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md) | The routes the apps use, verified from source: request, response, permission, state changes. |
| [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md) | How the migration runner works, the 019/020 overlap, and the three supported upgrade histories. |
| [`docs/SAMETA_INTEGRATION_REPORT.md`](docs/SAMETA_INTEGRATION_REPORT.md) | What was integrated and fixed, evidence, readiness, setup, SWOT, backlog. |
| [`docs/SAMETA_REVIEWER_GUIDE.md`](docs/SAMETA_REVIEWER_GUIDE.md) | Design choices explained, with likely questions. |
| [`mobile/docs/MOBILE_SETUP.md`](mobile/docs/MOBILE_SETUP.md) | Running the phone app, live vs preview mode. |
| [`docs/01_OVERALL_PLAN.md`](docs/01_OVERALL_PLAN.md) | Original product plan and scenes. |
| [`docs/02_BACKEND_EXECUTION.md`](docs/02_BACKEND_EXECUTION.md) | Backend design reference. |
| [`docs/03_FRONTEND_EXECUTION.md`](docs/03_FRONTEND_EXECUTION.md) | Frontend design reference. |
| [`docs/04_HACKATHON_DELIVERY.md`](docs/04_HACKATHON_DELIVERY.md) | Requirements R1–R10, scope and milestones for the event. |
| [`docs/05_FRONTEND_CONTRACT.md`](docs/05_FRONTEND_CONTRACT.md) | API fields the frontend uses. |
| [`docs/05_REDUCTION_PLAN.md`](docs/05_REDUCTION_PLAN.md) | Scope reduction to a single mill. |
| [`docs/06_FRONTEND_VERIFICATION.md`](docs/06_FRONTEND_VERIFICATION.md) | Frontend verification notes. |
| [`docs/07_BACKEND_BRANCH_COMPARISON.md`](docs/07_BACKEND_BRANCH_COMPARISON.md) | How the backend branches were merged. |
| [`docs/08_LOCAL_DEMO_ACCOUNTS.md`](docs/08_LOCAL_DEMO_ACCOUNTS.md) | Demo login and first-time mill setup. |

## Contributing

- Branch from `main` using `feature/…`, `fix/…`, `chore/…` or `docs/…`.
- Change the schema only with a **new** numbered migration; never edit one that has been applied.
- New API area: add `server/src/modules/<area>/<area>.{schema,service,routes}.js`, guard routes with permissions and zod validation, and mount the router in `modules/index.js`.
- Keep secrets out of Git. `.env` files are ignored; update the matching `.env.example` when you add a variable.
- Run the tests and `npm run build` before opening a pull request, and get one teammate's review.
