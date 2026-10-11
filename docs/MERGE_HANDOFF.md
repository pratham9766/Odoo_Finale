# SAMETA merge handoff (manual steps for the repository owner)

Prepared 2026-10-11 on branch `integration/sameta-consolidated`. **Nothing is committed, pushed or merged.** `HEAD` is `6b6e1f3`, identical to `origin/main` at the time of writing; all work is uncommitted on top of it.

## A. Merge readiness

**Ready for review and a pull request**, with the limits below. Not "ready to ship".

*Blockers before merging to main:* none found by automated checks. *Needed before you rely on it:*
1. Run `mobile/docs/QA_CHECKLIST.md` once on a real phone with a real login (nothing live was run; see section F).
2. Check the shared database's migration ledger (section C) before deploying the backend.
3. Add `NODE_ENV=production` to every deployed environment (CORS and the simulator warning depend on it).

*Nonblocking limits:* RFID firmware not compiled and no card scanned; plain-HTTP device channel; buyer tracking links cannot be revoked; new goods receipts are web-only; the web has no dedicated list of unresolved attendance; two role sets coexist in the demo database; mobile has no ESLint/TypeScript (a static import and icon checker stands in); the over-target rule is unchanged and any supervisor exception is **off** until you decide.

## B. What is changing

**Counts:** 147 paths (87 mobile app files, 4 mobile docs, 28 backend source files, 9 test files, 2 server config, 5 web, 4 migrations, 1 seed, 6 docs, 1 root config). One deletion (`client/.env`, untracked on purpose; the file stays on disk). No other deletions or renames.

**Why shared backend changes are necessary**
- `GET /me/work` and the Employee/default roles exist only on the mobile branch; the phone's landing screen needs them.
- Idempotency for production output and roll creation: a phone on a weak network cannot otherwise avoid double counting; it needs a server-side key store.
- Attendance correction and the payroll guard: RFID check-ins have no hours until a person enters a check-out; payroll must not treat them as real.
- `GET /rolls/:code` and `/trace` accept a scanned QR token (the QR carries a token, not the roll number).
- Dispatch hardening, `HOST`, `CORS_ORIGINS`, simulator off by default, `listPos.for_order_no`: from the mobile branch or required for a phone on the same Wi-Fi.

**Main's features preserved** (verified by diff and by tests): the newer web redesign, password reset, RFID (server, web page, firmware), `019_review_repairs`, `020_rfid_attendance`, freight/badge features. Of main's files only small targeted edits were made (listed in the integration report). `omkar`'s older copies of orders, procurement and tests were **not** carried over (main is newer).

**Mobile added:** the whole app (menu, dashboard, work orders, machine board, QC, trace, dispatch, stock, receipts, attendance, orders, My work, notifications, profile), the design kit, the retry-safe submission layer, token refresh, and the checks (`npm run check`, `npm test`).

**Investigated individually:** `client/.env` (public values only, no privileged credential, no rotation needed; values remain in git history, which was not rewritten); `mobile/.expo` (generated, removed from tracking); `mobile/.claude/settings.json` (an editor plugin toggle with no secrets; **optional to leave out**: `git restore --staged mobile/.claude`); `mobile/assets` (two large images, 0.4 MB and 0.8 MB, from the mobile branch); `package-lock.json` files (unchanged by this work; `npm ci` succeeds in all three apps).

**Disposable artifacts removed:** `client/dist`, `mobile/.expo` (both ignored build output created during checks). Nothing else needed removing; no logs, exports, `node_modules` or scratch folders are in the changed set (scanned).

## C. Database rollout note

*Verified here, on a disposable PostgreSQL 18 with the real runner:* fresh database, main-first history, mobile-first history, rerunning the migrator (nothing to apply), migration 022, the demo seed and the reset-then-reseed path. All reach the same schema, permissions and roles. See `docs/MIGRATIONS.md`.

*Understood:* the runner records **full file names**, orders by sorted name, stores **no checksum**, runs each file in its own transaction. Do **not** rename `019_*` or `020_*`.

*Unverified (no access to the shared Supabase database):* its actual ledger. Before deploying, in `server/`:
1. `npm run migrate -- --status` (read-only list). Note which of `019_review_repairs`, `020_rfid_attendance`, `019_default_role_permissions`, `020_employee_role` are marked applied.
2. Back up the database (Supabase dashboard backup or `pg_dump`). The migrations are additive, but 019/022 change `role_permissions`.
3. Confirm nobody applied a hand-written change that this repository does not know about.
4. `npm run migrate`. Expected: only the files missing from step 1, then `021` and `022`.
5. Check Settings → Roles & permissions: roles you edited are unchanged; Office and Supervisor can open the RFID page.

*Deployment order:* migrate **first**, then deploy the API, then web, then distribute the app. Compatibility: the new endpoints and columns are additive, and the `Idempotency-Key` header is optional, so the web app and an older phone build keep working against the new API. The new payroll guard takes effect immediately: expect `ATTENDANCE_UNRESOLVED` / `HOURS_MISSING` on the first wage run if old unresolved card check-ins exist; clear them with the mobile "Needs correction" tab or the attendance grid.

*Recovery:* migrations 021 and 022 only add a table, three columns, two indexes and permission rows (021) or permission rows (022). To undo 021 after a failed deploy: `drop table idempotency_keys; drop index if exists attendance_needs_correction_idx; alter table attendance drop column corrected_by, drop column corrected_at, drop column correction_reason;` (and remove the `021` row from `schema_migrations`); 022 has no schema effect and needs no undo. A restore from the backup in step 2 is the safe general recovery.

## D. Exact PowerShell commands (run them yourself; I have not)

```powershell
# 1. Review
cd C:\Users\Omkar\Desktop\Odoo_26_integration
git status
git diff HEAD --stat
git config user.name; git config user.email      # your existing identity; unchanged
```

```powershell
# 2. Stage only the intended files, then verify
git add .gitignore README.md client server db docs mobile
git restore --staged mobile/.claude              # OPTIONAL: leave the editor-plugin file out
git status                                       # nothing should remain unstaged except ignored files
git diff --cached --name-status | Select-String '^D'            # expect exactly: D  client/.env
git diff --cached --name-only --diff-filter=AM | Select-String '(^|/)\.env$|node_modules|\.expo|/dist/|\.log$|\.hbc$'   # expect NO output
git diff --cached --stat | Select-Object -Last 1
```

```powershell
# 3. Commit (uses your existing Git identity; no trailers added)
git commit -m "Consolidate mobile app with shared backend: idempotent writes, attendance correction, mobile UI" -m "Adds the mobile app on top of main, keeps RFID and the web redesign, reconciles migrations 019/020 without renaming, and adds migrations 021 and 022. See docs/SAMETA_INTEGRATION_REPORT.md and docs/MERGE_HANDOFF.md."
```

```powershell
# 4. CONDITIONAL: only if main has moved since (the count is not 0)
git fetch origin
git rev-list --count HEAD..origin/main           # 0 = nothing to do, skip the rest of this block
git merge origin/main                            # a normal merge commit; do NOT rebase or force-push
# if there are conflicts: resolve them, then  git add <files>  and  git commit
# This merge result is NEW code that has not been tested: run step 5 again before pushing.
```

```powershell
# 5. Final checks (after commit, and again after any merge of main)
cd server
npm ci
npm run lint
npm test
$env:SAMETA_TEST_ADMIN_URL = 'postgresql://postgres:<password>@127.0.0.1:5432/postgres'   # a LOCAL disposable PostgreSQL only
npm run test:db
Remove-Item Env:SAMETA_TEST_ADMIN_URL
cd ..\client; npm ci; npm test; npm run build
cd ..\mobile; npm ci; npm run check; npm test; npx expo-doctor; npx expo install --check
cd ..
```
(`npm test` in `server` needs a `server/.env` or dummy values for `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `PUBLIC_TRACK_BASE_URL`; it touches no database. Copy your real `.env` files into this folder first if you want to run the apps; they are ignored by git.)

```powershell
# 6. Push the branch
git push -u origin integration/sameta-consolidated
```
Then open the pull request on GitHub (the `gh` command-line tool is not installed here): <https://github.com/pratham9766/Odoo_Finale/compare/main...integration/sameta-consolidated>, base `main`, and paste section E.

**About history.** This branch starts from `origin/main`, so a normal **merge commit** (GitHub "Create a merge commit") preserves this branch's commit history. The mobile files arrive as new files; `omkar`'s own commits stay on the `omkar` branch and are **not** merged (a content-level merge of `omkar` would revert main's newer code). If you want the mobile app's authorship in `main`'s history, keep `omkar` as the reference branch. My earlier suggestion of `git merge -s ours omkar` is **withdrawn**: do not run it. If you prefer one commit on `main`, "Squash and merge" also works but loses this branch's individual commits.

## E. Pull request title and description

**Title:** `Add the mobile app on the shared backend; retry-safe writes, attendance correction, migration reconciliation`

**Description:**
```
## What
- Brings the Expo mobile app into main on top of the latest web, RFID and backend.
- One backend for web and phone; no second API. The phone adds no business rules of its own.

## Shared backend
- GET /me/work, Employee/default roles, token lookup for roll GET/trace.
- Idempotency-Key for production output and roll creation (atomic with the change, scoped per user and operation, 409 on a changed payload); GET /idempotency/:op/:key to ask whether an entry was saved.
- RFID check-ins stay unresolved until a supervisor enters the check-out (POST /attendance/:id/correct, with reason, actor, audit). Payroll refuses to continue while unresolved card check-ins or hourly days without hours exist.
- Dispatch confirm re-checks eligibility under lock; repeat scan of the same roll is harmless.
- HOST, CORS_ORIGINS; RFID simulator is now opt-in (RFID_SIMULATOR_ENABLED=true).
- The output limit is unchanged (refused for everyone above 125% of target). The percentage is a mill setting; a supervisor exception exists but is OFF unless allow_over_target_override is set.

## Database
- 019/020 exist twice (one pair from each branch). Nothing renamed: the runner tracks full file names.
- New: 021_idempotency_and_attendance_corrections, 022_default_roles_rfid_view.
- Proven for fresh, main-first and mobile-first databases, rerun, and demo seed/reset (docs/MIGRATIONS.md). The shared database's ledger was NOT inspected.

## Mobile UI
- Shared design kit; reworked dashboard, work orders, machine board, QC, trace, dispatch, stock, receipts, attendance, orders.
- Output and roll creation are separate steps; unconfirmed entries survive an app restart; clear offline/error/stale-data states; 48 dp targets; confirmation before consequential actions.

## Validation (all run on this branch)
- server: lint, 68 offline tests, 59 database-backed tests (PostgreSQL 18, concurrency, rollback, migrations, seed, client contract)
- web: 6 tests, production build
- mobile: import and icon check, 18 unit tests, expo-doctor 21/21, expo install --check, Android export (release bundle contains no preview code)
- Android 16 emulator, preview mode: start-up, dashboard, menu, machine board, work-order logging flow

## Not verified (needs credentials/hardware/phone)
- Live sign-in and token refresh against Supabase; camera/scanning; TalkBack, large fonts, small phones, offline behaviour (see mobile/docs/QA_CHECKLIST.md)
- ESP32 firmware and a real card scan
- Migration on the shared database (checks in docs/MERGE_HANDOFF.md)

## Deployment notes
- Migrate first, then API, then web, then the app. Set NODE_ENV=production.
- Set RFID_SIMULATOR_ENABLED=true in development if you use the virtual scanner.
- The first wage run may report unresolved attendance: use the mobile "Needs correction" tab or the attendance grid.
```

## F. What was verified, and how

| How | What |
|---|---|
| **Automatically** (commands above, run fresh on this tree) | server lint; 68 offline tests; 59 database-backed tests; web 6 tests and build; mobile check, 18 tests, expo-doctor, `expo install --check`; Android release export (no preview code, no stale address, no `x-org-id`); full seed with history and reset path |
| **Source inspection** | permissions and roles match across web, phone and server (also tested); no duplicate backend; the unexpected-deletion review; env examples hold placeholders only (secret-pattern scan of every changed file) |
| **On a device** (Android 16 emulator, preview mode) | start-up, preview banner, dashboard, menu, machine board, work-order screen, numeric keypad with field and button visible, review dialog, saved state, secure-storage reads/writes |
| **Blocked** (no credentials, hardware or shared-DB access) | live Supabase sign-in and refresh; camera scanning; ESP32; the shared migration ledger; screen-reader, large-font, small-screen and offline behaviour |
