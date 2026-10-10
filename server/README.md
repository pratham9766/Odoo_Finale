# TexLink server

Node 20+ · Express 5 · plain SQL with `pg` · Supabase Postgres (RLS) · zod 4.
Plan: [docs/02_BACKEND_EXECUTION.md](../docs/02_BACKEND_EXECUTION.md).

## Run

```bash
cp .env.example .env        # fill SUPABASE_*, DATABASE_URL, AI_DATABASE_URL, MIGRATION_DATABASE_URL, APP_USER_PASSWORD, AI_READER_PASSWORD
npm install
npm run migrate             # applies db/migrations/*.sql once each (use -- --status to list)
npm run dev                 # http://localhost:4000/health
npm test                    # real Supabase auth + real DB; every test cleans up what it creates
```

`APP_USER_PASSWORD` / `AI_READER_PASSWORD` are injected into `001_roles_helpers.sql` by `db/migrate.js` and must match the passwords inside `DATABASE_URL` / `AI_DATABASE_URL`.

## Adding a module (Hrishikesh's modules follow this)

1. `modules/<name>/<name>.{schema,service,routes}.js`; routes use `can()`, `validate()` and `send()`.
2. Every DB access goes through `withTenant(ctx, db => ...)`; cross-tenant work only through `withSystem(orgId, ...)`.
3. Emit events **after** `withTenant` resolves (`bus.emit`); add the event to §12 of the plan.
4. Mount the router in `modules/index.js` (kiosk routes in `modules/workforce/kiosk.routes.js` are auto-mounted by `app.js`).
5. Cron jobs: `jobs/<name>.js` calls `register(name, cron, (orgId, db) => ...)` from `jobs/index.js`; they are auto-loaded. `POST /admin/jobs/:name/run` runs one on demand.
6. Event listeners: `events/listeners/{dispatchReactions,attendanceReactions}.js` export `register()` and are auto-loaded.
7. Migrations: own files only; a new table after a merge goes in a new numbered file (next free number is 020).

## Contracts available to the factory-floor modules (§22.2)

| Need | Import |
|---|---|
| Tenant transaction | `db/withTenant.js` → `withTenant`, `withSystem`, `setTenant` |
| Guards | `middleware/rbac.js` → `can`, `inScope`, `isInScope`, `scopeIds`, `hidePrices`, `requireModule` |
| Validation | `middleware/validate.js` → `validate({params,query,body})` → `req.valid.*` (Express 5: `req.query` is read-only) |
| Numbers / audit / paging | `utils/numbering.js` `nextNumber`, `utils/audit.js` `audit`, `utils/paginate.js` `where` + `paged` |
| Stock | `modules/inventory/inventory.core.js` → `issueForWorkOrder`, `produce` (`orderId` reserves the output for the next stage; `type:'scrap'` for waste) |
| BOM tree | `modules/catalog/bom.service.js` → `explode(db, itemId, qty, {netStock})`, `summarize` |
| Notifications | `modules/notifications/notify.js` → `notify(db, {orgId, ...})` |
| Trips | `modules/transport/trips.core.js` → `createTripForDispatch(db, ctx, {dispatch, transporterOrgId, ...})` returns `{trip, otp, emitRequested}`; call `emitRequested()` after commit and hand `otp` to the buyer notification only |
| Order status | emit `workorder.started/finished` `{orgId, orderId}`, `production.logged`, `qc.done`, `dispatch.confirmed` `{sellerOrgId, orderId, dispatchId}`, `dispatch.received`; the status engine reacts. `trip.delivered` is emitted by the transport module (dispatch + roll status are updated there) |
| Realtime | `realtime/socket.js` → `emitTo(room, event, data)` (no confidential fields) |
| Email / PDF | `utils/email.js` `send`, `utils/pdf.js` — **stubs**: replace the bodies, keep the signatures |

Files written as placeholders so the schema and contracts work today (Hrishikesh owns and should overwrite): migrations `007`–`011`, `015`; `utils/{pdf,email,textile,money}.js`.

## Notes

- The Supabase direct host `db.<ref>.supabase.co` is IPv6-only. Use the Supavisor pooler URL (`:6543`, user `app_user.<ref>`) on hosts without IPv6 (Render, most CI).
- `GEMINI_API_KEY` is optional: without it `POST /ai/chat` returns 503 and the insight job keeps template text. The model calls themselves are not covered by automated tests (the guard, read-only role and tenant isolation are).
