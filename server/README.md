# TexLink server

Node 20+ · Express 5 · plain SQL with `pg` · Supabase Postgres (RLS) · zod 4 · Gemini for the AI assistant.
Plan: [docs/02_BACKEND_EXECUTION.md](../docs/02_BACKEND_EXECUTION.md).

## Run

```bash
cp .env.example .env        # fill SUPABASE_*, the three DB urls, APP_USER_PASSWORD, AI_READER_PASSWORD, GEMINI_API_KEY (optional)
npm install
npm run migrate             # applies db/migrations/*.sql once each (-- --status lists them)
npm run seed -- --masters   # seconds: both mills, users, machines, workers, items, BOMs
npm run seed                # + 90 days of history + connected buyer/supplier/transporter/driver/platform-admin logins
npm run reset -- --yes      # demo reset: empty every tenant table, delete *.demo logins, seed again (--days=14, --no-seed)
npm run dev                 # http://localhost:4000/health
npm test                    # real Supabase auth + real DB; every test cleans up what it creates
```

`APP_USER_PASSWORD` / `AI_READER_PASSWORD` are injected into `001_roles_helpers.sql` by `db/migrate.js` and must match the passwords inside `DATABASE_URL` / `AI_DATABASE_URL`.

**The seed replays history through the real services**, so its speed is bound by database latency: about 3 minutes per simulated day over a remote link (`--days=14` ≈ 45 min, 90 days is an overnight run). Run it close to the database, or use `--days`. Demo logins use the password `Demo@1234`: `owner@everest.demo`, `gm@`, `prodmgr@`, `sup.weaving@`, `op.w3@`, `qchead@`, `qc@`, `store@`, `dispatch@`, `purchase@`, `sales@`, `accounts@`, `hr@`, `maint@`, `gate@everest.demo`; `owner@shakti.demo`; `buyer@metrofashion.demo`, `sales@coimbatoreyarns.demo`, `fleet@speedfreight.demo`, `driver@speedfreight.demo`, `admin@texlink.demo` (platform admin).

## Adding a module

1. `modules/<name>/<name>.{schema,service,routes}.js`; routes use `can()`, `validate()` and `send()`.
2. Every DB access goes through `withTenant(ctx, db => ...)`; cross-tenant work only through `withSystem(orgId, ...)`.
3. Emit events **after** `withTenant` resolves (`bus.emit`); add the event to §12 of the plan.
4. Mount the router in `modules/index.js`.
5. Cron jobs: any `jobs/<name>.js` is auto-loaded. Either `register(name, cron, (orgId, db) => ...)` (runs per org) or `export const x = { name, schedule, run }` (the job loops orgs itself via `forEachActiveOrg`). `POST /admin/jobs/:name/run` runs one on demand.
6. Event listeners: any `events/listeners/<name>.js` exporting `register()` or `register<Name>()` is auto-loaded.
7. Migrations: a file that has been applied is never re-run. Change the schema with a **new** numbered file (next is 021). `020_sync_edited_migrations.sql` shows how to patch databases that ran an earlier version of an edited file.

## Contracts between the modules (§22.2)

| Need | Import |
|---|---|
| Tenant transaction | `db/withTenant.js` → `withTenant`, `withSystem`, `setTenant` |
| Guards | `middleware/rbac.js` → `can`, `inScope`, `isInScope`, `scopeIds`, `hidePrices`, `requireModule` |
| Validation | `middleware/validate.js` → `validate({params,query,body})` → `req.valid.*` (Express 5: `req.query` is read-only) |
| Numbers / audit / paging | `utils/numbering.js` `nextNumber`, `utils/audit.js` `audit`, `utils/paginate.js` `where` + `paged` |
| Stock | `modules/inventory/inventory.service.js` → `issueForWorkOrder`, `produce` (`orderId` reserves the output for the next stage; `type:'scrap'` for waste), `reserveFifo` |
| BOM tree | `modules/catalog/bom.service.js` → `explode(db, itemId, qty, {netStock, forOrderId})`, `summarize` |
| Notifications | `modules/notifications/notify.js` → `notify(db, {orgId, ...})` |
| Trips | `modules/transport/trips.core.js` → `createTripForDispatch` (supply dispatches); sales dispatch confirm writes its own trip with `utils/otp.js` `generateOtp`/`hashOtp` |
| Order status | emit `workorder.started/finished` `{orgId, orderId}`, `order.planned`, `production.logged`, `qc.done` `{orgId, rollId}`, `dispatch.confirmed`, `dispatch.received`, `trip.delivered`; the status engine reacts (`events/listeners/statusEngine.js`) |
| Roles / context outside HTTP | `modules/staff/defaultRoles.js` → `createDefaultRoles(db, orgId, types)`; `middleware/tenant.js` → `loadContext(orgId, userId)` |
| History replay | order, PO and GRN services accept `{ at }` (seed only; HTTP never passes it) |
| Realtime | `realtime/socket.js` → `emitTo(room, event, data)` (no confidential fields) |

## Notes

- Use the Supavisor pooler urls from the Supabase dashboard (`aws-0-<region>.pooler.supabase.com`): app roles on `:6543` as `app_user.<ref>` / `ai_reader.<ref>`, migrations and seed on `:5432` as `postgres.<ref>`. The direct host `db.<ref>.supabase.co` is IPv6-only and fails DNS intermittently.
- `GEMINI_API_KEY` is optional: without it `POST /ai/chat` returns 503 and the insight job keeps template text. `AI_MODEL` defaults to `gemini-3.5-flash-lite`; if Google retires a model the API answers 404 with the replacement id.
- Files in this repo may be checked out with CRLF (`core.autocrlf`); scripted edits must preserve line endings.
