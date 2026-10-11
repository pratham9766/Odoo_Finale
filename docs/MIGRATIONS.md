# Database migrations: how they work and how the 019/020 overlap was reconciled

## How the runner works (read from `db/migrate.js`)

- It lists `db/migrations/*.sql` matching `^\d+_.*\.sql$` and **sorts by full file name**.
- Applied migrations are recorded in `public.schema_migrations(name text primary key, applied_at)`, **by full file name**, not by number.
- Each pending file runs once, **in its own transaction** (`BEGIN … insert into schema_migrations … COMMIT`); a failure rolls that file back and stops.
- **No checksum is stored.** Editing a file that was already applied changes nothing on that database, and nothing detects it.
- Placeholders `{{NAME}}` come from the environment (`APP_USER_PASSWORD`); `--local` (or a localhost URL) creates a stub `auth.users` table.
- `npm run migrate -- --status` lists applied (✔) and pending (·) files.

## The overlap

Two branches each created a 019 and a 020:

| From main | From the mobile branch |
|---|---|
| `019_review_repairs.sql`: recovers role permissions after 018, worker badge tokens, freight | `019_default_role_permissions.sql`: creates the Office / Supervisor / QC Inspector / Store Keeper / Operator roles with their permissions |
| `020_rfid_attendance.sql`: RFID tables, `rfid.*` permissions | `020_employee_role.sql`: the Employee role |

Because the runner works on **full names**, the four files do not collide. Renaming any of them would be harmful: a database that already ran `019_review_repairs.sql` would see `021_…` as new and run it a second time. **They keep their names; nothing was renamed.** Sorted order is `019_default_role_permissions`, `019_review_repairs`, `020_employee_role`, `020_rfid_attendance`.

Dependencies between them were checked: all four are additive and idempotent (`on conflict do nothing`, `where not exists`). The only order-sensitive effect is that `020_rfid_attendance` grants `rfid.view` to every role that can already see attendance: on a database that ran it **before** `019_default_role_permissions` created Office and Supervisor, those two roles were missed. **`022_default_roles_rfid_view.sql`** closes that gap, only for roles nobody has ever edited through the app (no `audit_logs` row for the role), so a permission removed on purpose stays removed.

New migrations from here on: **`021_idempotency_and_attendance_corrections.sql`** (idempotency keys; who/when/why of an attendance correction) and **`022_default_roles_rfid_view.sql`**. Every future migration needs a **unique** number above 022; `server/test/db/migrations.test.js` fails on any other new duplicate.

## The three supported histories (all executed and compared)

`server/test/db/migrations.test.js` runs the real `db/migrate.js` against disposable databases:

| History | What is applied | Result |
|---|---|---|
| **A. Fresh, empty database** | all 22 files | ledger = the 22 names |
| **B. Database already migrated from main** (001–018, `019_review_repairs`, `020_rfid_attendance`) | only `019_default_role_permissions`, `020_employee_role`, 021, 022 | ledger = the 22 names |
| **C. Database already migrated from the mobile branch** (001–018, `019_default_role_permissions`, `020_employee_role`) | only `019_review_repairs`, `020_rfid_attendance`, 021, 022 | ledger = the 22 names |

The test then compares the three results: same columns, same permission catalogue, same roles, **same permissions per role**, and running the migrator again applies nothing. (Before 022 existed, history B differed from A in the permissions of Office and Supervisor: that is how the gap was found.)

## What to check before touching a shared database (not done here)

I did not connect to any shared database. Before deploying:

1. `npm run migrate -- --status` against the shared database, and note which of the four 019/020 files it already lists.
2. Take a backup. Migrations are additive, but 019 files change `role_permissions`.
3. Confirm no hand-written migration or manual schema change exists on that database that this repository does not know about (the runner cannot detect it).
4. Run `npm run migrate`. Expected: only the files missing from section "The three supported histories".
5. Check Settings → Roles & permissions: roles you edited are unchanged; the default roles exist; Office and Supervisor can open the RFID page.

## Disposable database for the tests

`server/test/db/harness.js` creates a brand-new UTF-8 database per test file on a **local** PostgreSQL named by `SAMETA_TEST_ADMIN_URL` (it refuses any non-local host), migrates it with the real runner, and drops it afterwards. It also creates the `anon`, `authenticated` and `service_role` roles Supabase normally provides.

```bash
# a local PostgreSQL superuser URL, not a Supabase one
SAMETA_TEST_ADMIN_URL=postgresql://postgres:<password>@127.0.0.1:5432/postgres npm run test:db   # from server/
```
Without the variable the database tests are skipped, and `npm test` stays offline.
