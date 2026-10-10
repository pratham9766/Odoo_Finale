# Backend branch comparison — 2026-10-10

Compared fetched `vipul` at `3e2d48f` with `hrishi_1` at `e6790f4`. Integration selection: Vipul only, retaining the existing frontend and local Sameta edits. Hrishi's reverted implementation is not being restored.

| Area | Vipul | Hrishi |
|---|---|---|
| Application | Express entry point, config, auth, tenant middleware, RBAC, realtime and jobs | Directory skeleton only |
| Database | Runner and migrations 001–019, RLS, grants and reporting views | Only migrations 007, 008 and 010; depends on missing baseline |
| APIs | Staff, partners, catalog/BOM, stock/receipts, orders, procurement, transport, notifications, AI, public tracking, platform routes | No implemented API routers |
| Factory floor | Schema placeholders; production, QC, maintenance, workforce, dispatch and finance/report routers not mounted | More constraints and indexes in factory-floor schema, but no corresponding API services |
| PDFs | Basic JSON-to-PDF stubs | More detailed document layouts; QR still token text |
| Textile utilities | Names consumed by catalog conversion API | Broader validation/calculations, different exported names and return shapes |
| Tests | Nine standalone SQL-guard cases passed in this sync; other suites depend on configured Supabase/database | Six textile unit tests passed during the earlier inspection; not rerun in this sync |

## Concrete merge incompatibilities

- Vipul `bom.service.js` calls `fabricMToKg`, `fabricKgToM`, `warpWeft`, `grossUp`, etc. Hrishi exports `fabricMetresToKg`, `fabricKgToMetres`, `splitWarpWeft`, `grossInput`, etc. Replacing the utility unchanged breaks those API calls.
- Hrishi migration 010 defines `shifts.crosses_midnight` as a generated column. Vipul `me.service.js` explicitly inserts it during organization creation. Those implementations require a coordinated migration/service change.
- Both branches independently create the same migration numbers. Applied migrations must not be overwritten blindly; schema upgrades should use a new migration after the database's applied state is known.

## Frontend integration gaps found

- Orders UI sends `status=` for all statuses; Vipul's optional status regex rejects an empty string. Omit empty filters in the next frontend integration change.
- Stock view exposes item display text as `name`; current frontend expects `item_name`.
- `/machines/board` is not mounted; production board awaits its owner.
- Buyer contacts require `partners.view`, and catalog requires the appropriate item permission in addition to order creation permission.
- Seed script is referenced by package.json, but db/seed/seed.js is not in Vipul's fetched tree.

These are inspection findings, not a live API test. Backend tests create and delete real Supabase users/data: run them only against an explicitly configured disposable test project. No migration, external DB mutation, or full integration suite was run in this sync.

## Git handling

The previous Hrishi merge/revert left Vipul's older ancestor in history while removing its contents. During this merge, server/, db/, and the backend execution document were explicitly reconciled to origin/vipul. The .gitignore add/add conflict was resolved by retaining all ignore entries. Local Sameta edits are restored after the integration commit and remain uncommitted.
