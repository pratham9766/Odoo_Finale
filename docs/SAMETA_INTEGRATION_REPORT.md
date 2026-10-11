# SAMETA integration report

Branch `integration/sameta-consolidated`, started from `origin/main` **`6b6e1f3`** (2026-10-11). Nothing is committed or pushed; everything is left as working-tree changes for review. Prepared on 2026-10-11.

Read with: [API_CONTRACTS.md](API_CONTRACTS.md), [MIGRATIONS.md](MIGRATIONS.md), [mobile/docs/MOBILE_SETUP.md](../mobile/docs/MOBILE_SETUP.md), [mobile/docs/QA_CHECKLIST.md](../mobile/docs/QA_CHECKLIST.md), [SAMETA_REVIEWER_GUIDE.md](SAMETA_REVIEWER_GUIDE.md).

---

## A. Executive assessment

**What changed**
1. The mobile app, the RFID work and the backend fixes now live in **one** branch (before: mobile only on `omkar`; RFID and review fixes only on `main`).
2. The overlapping migrations 019/020 were reconciled **without renaming anything**, proven for a fresh database and for databases already migrated from either side (a real gap was found and closed with migration 022).
3. A production entry that is retried after a lost response can no longer be counted twice (server idempotency + a phone-side record that survives a restart). Same for roll creation.
4. RFID check-ins no longer turn into accurate-looking pay: they stay *unresolved* until a supervisor enters the real check-out with a reason; payroll refuses to continue while any exist.
5. The mobile UI was rebuilt on one shared design kit (tokens, buttons, fields, status badges, dialogs, loading / error / offline states), and every shop-floor screen was reworked.
6. Configuration hygiene: tracked `client/.env` and generated `.expo` untracked, no guessed server address, no stale organisation header, simulator off by default, preview mode cannot reach a release build.
7. The demo seed was broken by the merge (duplicate role names) and was fixed and covered by a test.

**What is ready, with evidence** (all run on this branch; commands in section C)
- Server: lint clean; **68 offline tests** and **59 database-backed tests** pass (real PostgreSQL 18, concurrency, rollback, migrations, seed).
- Web: **6 tests** pass, production build succeeds.
- Mobile: `npm run check` (70 files), **18 unit tests**, `expo-doctor` 21/21, `expo install --check` clean, Android bundle exports.
- Full seed plus a 14-day history replay through the real services runs on a freshly migrated database and again after a reset.

**What remains blocked or not done**
- **Nothing was run on a phone or emulator.** All UI and device behaviour (camera, keyboard, small screens, large text, back button, real login, expired session) is *not verified*: see [QA_CHECKLIST.md](../mobile/docs/QA_CHECKLIST.md).
- **No shared database, Supabase project, or deployment was touched.** The applied-migration history of any shared database is unknown (what to check: [MIGRATIONS.md](MIGRATIONS.md)).
- **ESP32 firmware was not compiled and no card was scanned**; RFID is verified at server level only.
- Real Supabase login, JWT refresh against the real provider, and the provider's password policy were not exercised (no credentials, by design).
- One business value needs your decision: how far over target a stage may log output (see "Open question"). **Until you confirm it, behaviour is unchanged: output over 125% of target is refused for everyone.**

| Readiness | Assessment |
|---|---|
| **Demo** | **Ready after named steps**: run the mobile device checklist once with a real login, check the shared database's migration status, and re-run the checks after merging |
| **Pilot** (real staff, real data, a few weeks) | **Not ready**: no device testing yet; RFID unverified on hardware; plain-HTTP device channel; no offline queue; one business threshold unconfirmed |
| **Production** | **Not ready**: HTTPS for devices, provider password policy, backups and monitoring, device-level security of the RFID card UIDs (clonable), an access review, and a load test were not part of this work |

**Open question (one):** *By how much may one stage exceed its work-order target (currently 25 %, the limit that already existed as a constant in the code, now changeable in the mill settings), and should a supervisor ever be allowed to approve an exception?* Today exceeding the limit is **refused for everyone**, exactly as before. An exception path (supervisor confirms with a reason, audited) exists in the code but is **off** unless the mill sets `allow_over_target_override`; it is not an approval workflow you have agreed to, so it is not active.

---

## B. Integration summary

**Starting points.** `origin/main` `6b6e1f3` (it had moved from the audited `9bb0067`; the difference is a comment-only commit across 142 files). Mobile development: `omkar` `4abd10d`, plus your uncommitted work in that workspace.

**Method.** A new worktree `C:\Users\Omkar\Desktop\Odoo_26_integration` on a new local branch `integration/sameta-consolidated`. Your original workspace (branch `omkar`, with its uncommitted files and the three audit documents) was **not touched**. A straight merge of `omkar` into main was attempted and **aborted**: more than ten files conflicted, because `omkar`'s web and server code is an older copy of what `main` has since rewritten, and merging would have reverted main's newer work. Instead each piece was brought across on purpose.

| Brought from `omkar` | How |
|---|---|
| The whole mobile app (75 files, **without** the generated `.expo` folder) | checked out and then reworked |
| `GET /me/work` (`myWork.service.js`, route, schema) | copied; access rules now tested |
| Migrations `019_default_role_permissions`, `020_employee_role`; built-in roles in `defaultRoles.js` | copied; made idempotent |
| Dispatch confirm hardening (re-checks order, status and quantity under lock) | copied; now tested |
| Web: **My work** page + route + menu, **Purchase orders** page + route + menu | copied and wired (`main` had no purchase-order screen) |
| Your uncommitted work: Trace-a-roll screen, token lookup in `rollByNo`, UI polish | copied, then superseded/extended by the redesign |
| **Kept from `main`** | RFID (server, web page, firmware), review repairs, password reset, newer web redesign, newer seed |
| **Not brought** | `omkar`'s older web restyle (orders page, invite page styling, `CreateWorkspace.jsx`, `realtime.js`): `main` has newer equivalents or they belong to the removed organisation model; the web has no socket client on `main` either, so nothing live was lost |

**Conflict resolutions that needed a decision**
- *Migration numbers 019/020 exist twice:* kept every name, added 021/022 (see MIGRATIONS.md).
- *Role names:* both the migrations and the demo seed create "QC Inspector" and "Store Keeper" and `roles.name` is unique, so the seed failed on a migrated database. `createDefaultRoles` and the seed's team generator now **reuse an existing role and only add permissions** (nothing is removed). Consequence for the demo: it has the built-in roles *and* the seed's own (for example both "Supervisor" and "Floor Supervisor"). Say if you want them folded into one set.
- *Simulator:* the two sides disagreed on its default; it is now off unless `RFID_SIMULATOR_ENABLED=true`.

**Existing user changes preserved.** Your workspace is unchanged. Your local `server/src/index.js` change (listen on `0.0.0.0`) became the `HOST` setting (default `0.0.0.0`); your `app.js` CORS change became environment-aware CORS (see findings, section C).

---

## C. Findings

Evidence level: **T** = covered by an automated test I ran; **S** = verified by reading source; **NR** = not run (needs a device, hardware, or a shared service).

| # | Sev | Finding (earlier audit ID) | Source evidence | Fix | Test evidence | Remaining limitation |
|---|---|---|---|---|---|---|
| 1 | P0 | Product split across branches; migration 019/020 overlap (F-01) | `git diff`, `db/migrate.js` | Consolidated; names kept; 022 added | **T** `migrations.test.js` (3 histories converge) | Shared DB history unknown; merge to remote main not done |
| 2 | P0 | Merge broke the demo seed (duplicate role names) | `roles.name unique`; `seed/generators/team.js` | Reuse role by name, add permissions | **T** `seed.test.js` (fresh and after reset) + real full seed with history | Demo shows both role sets |
| 3 | P1 | `GET /me/work` missing on main (F-02) | grep on `main` | Ported | **T** `http.test.js` (own record only; unlinked login; validation) | Employee login needs a linked worker record |
| 4 | P1 | Production log applied twice after a lost response (F-03) | `productionLogs.service.js` | `Idempotency-Key`, advisory lock, atomic store, conflict on changed input; phone keeps the entry across restart; check/resend/discard | **T** 12 tests incl. 40 simultaneous requests, mutation-checked; 13 mobile tests | Other writes are state-protected, not keyed (below) |
| 5 | P1 | Same risk for **roll creation** | `rolls.service.js` | same mechanism | **T** | |
| 6 | P1 | RFID check-in = 0 hours looked payable (F-05) | `rfid.scan.js`, `wages.service.js` | Unresolved list, `correct` endpoint (explicit times, reason, actor, audit), payroll blocked (`ATTENDANCE_UNRESOLVED`, `HOURS_MISSING`) | **T** 13 attendance tests + HTTP | Web has no dedicated correction list (uses mobile screen or the attendance grid); no check-out by second scan (deliberately not assumed) |
| 7 | P1 | Output limit (F-04). **The earlier audit was wrong:** a hard 125 % limit already existed | `outputLimits.js` | Kept exactly as it was (422, same message). The percentage is now a mill setting; a supervisor exception exists but is **off by default** (`allow_over_target_override`); 3-decimal check added | **T** (default refusal, exception on and off) | Threshold and any approval rule are a business decision (open question) |
| 8 | P1 | Dispatch integrity | `dispatches.service.js`, `confirm.service.js` | Existing locks kept; repeat scan of same roll answers `already_scanned`; confirm re-checks under lock | **T** 8 tests: race for one roll, double confirm, rollback when invoice fails, QC override on packed roll | |
| 9 | P1 | Session: no refresh coordination, background timer (F-11) | `Session.jsx` | single-flight refresh, 401≠403, retry reads and keyed writes only, offline ≠ signed out, AppState refresh, offline sign-out | **T** unit (13) | **NR** against real Supabase and on a device |
| 10 | P1 | `client/.env` tracked (F-06) | `git ls-files` | Untracked, ignore rules, examples updated | S | It held **only 3 public values** (API URL, Supabase URL, a `sb_publishable_` key): **no privileged credential, no rotation needed**. Values remain in git history (public by design); history was not rewritten |
| 11 | P1 | Guessed LAN address, placeholder EAS id, stale org header (F-07) | `client.js`, `app.config.js` | Removed; app shows a setup screen naming missing variables; EAS id left out (run `eas init`) | **T** release bundle contains neither the address nor `x-org-id` | |
| 12 | P2 | Preview mode (F-08) | `app/_layout.jsx` | Dev-only, compiled out of release builds, banner, sample shapes fixed | **T** release export with the flag set: no preview strings; dev export: present (positive controls) | |
| 13 | P2 | Simulator on by default; reset could remove real rows (F-10) | `env.js`, `rfid.service.js` | Opt-in; simulator never rewrites an existing row; reset skips corrected rows and refuses locked months | **T** | |
| 14 | P2 | CORS | `app.js` | `CLIENT_URL` + `CORS_ORIGINS`; any localhost port only outside production; native apps need none | S | |
| 15 | P2 | Repo hygiene (F-13) | `.expo` tracked, README | `.expo` untracked, README corrected | S | |
| 16 | P2 | Quality gates (F-12) | | `test:db` suite; mobile `check` and `test` | **T** | No ESLint/TypeScript for mobile (a static import checker stands in) |
| 17 | P2 | RFID device channel (F-09) | `iot.routes.js` | **Not changed**: per-IP rate limit, unlimited unknown-card log rows, plain HTTP | NR | Needs TLS and a per-device limit before real use |
| 18 | P2 | Buyer tracking link has no expiry or revocation | `orders.service.js` | Mobile shares only with `orders.view`, after a plain warning | S | No way to switch a link off: backend change needed |
| 19 | P3 | Web has no real-time subscription (README promised "Realtime") | `client/package.json` | Documented; mobile labels data age | S | Polling only |

**Writes that are not idempotent-keyed, and why that is acceptable now.** QC inspection (only `pending_qc` can be inspected: a retry gets `409` and the screen shows the roll's real status), dispatch scan (a repeat is harmless), dispatch confirm (second attempt gets `409`; the screen refetches and says what really happened), order confirm/cancel and receipt post/cancel (state-checked, same handling). Attendance bulk save is idempotent by its natural key (worker, date, shift).

**Test totals:** offline 68/68, database 59/59 (idempotency 13, dispatch 8, attendance 13, HTTP 8, client contract 7, migrations 7 including 3 naming-policy tests, seed 3), web 6/6, mobile 18/18. The concurrency tests were **mutation-checked**: removing the advisory lock makes them fail.

---

## D. UI/UX summary (mobile)

**Not verified on a device.** No screenshots were captured. What exists is source, a compiling Android bundle, and unit tests of the logic behind the screens.

**Reusable pieces** (`src/theme/theme.js`, `src/components/ui.jsx`, `forms.jsx`, `feedback.jsx`): type scale and spacing tokens; `ActionButton` (≥ 48 dp, label always, busy = disabled); `Field` (visible label, unit, error, helper, decimal keypad); `SearchBar`; `ConfirmDialog` (keyboard-safe, scrollable); `StatusBadge` (icon + words); `Banner`; toast (shown only after the server confirms); `ConnectivityBanner`; `Freshness` ("Updated 10:42"); `QueryState` (skeleton / error with Retry / **last data kept under an "old data" banner**, never zeros for a failure); `Screen` (safe areas, keyboard, tablet centring, sticky footer); `describeError` (words for the floor, and whether a write may have been saved). Contrast of text and status colours was computed and the failing ones darkened; the brand colours are the existing `#103C32` family (**`#216457` is not used anywhere in this project**, so it was not introduced).

| Screen | Main problem solved |
|---|---|
| Dashboard | Was a wall of numbers: now "Needs attention" (machines down, QC waiting, open attendance, low stock…) and "Your jobs" by permission; partial failures are announced instead of hidden |
| Work orders (all) | Search, status filters, progress with units; clearly labelled as **all** work orders, not personal |
| Work-order detail | Status, **output** and **roll** are three separate steps; only valid actions appear; review dialog; unconfirmed entries panel; drafts kept per user; over-target is refused (a supervisor button appears only if the mill enabled the exception) |
| Machine board | Running / idle / breakdown / maintenance differ by icon, word, colour and a coloured edge; grid on tablets; one clear way into the work order |
| QC | Roll identified (from number **or** scanned token) before deciding; consequence stated; confirmation for rework/reject; typing a number works without a camera; camera errors explained |
| Dispatch | Overview, packing, packed list and confirmation are separate; each refusal says what to do; confirm needs a dialog and cannot be double-pressed; a lost answer says "not confirmed" and refreshes |
| Stock / receipts | On hand, reserved and free with units; low-stock explained; post/cancel confirmed. **New receipts are still entered on the web** |
| Attendance | Worker view, **Needs correction** with payroll impact, correction form with explicit times, reason and a preview of the hours |
| Roll trace | Verdict, production context, timeline, lots, inspections; missing data is stated ("Not recorded") |
| Orders | Search and status; confirm/cancel dialogs; **Share buyer tracking link** with an honest warning |

**Device checks:** *performed:* none. *Not performed:* all of [QA_CHECKLIST.md](../mobile/docs/QA_CHECKLIST.md).

---

## E. Setup instructions

```bash
# one-time
cd server && npm install && cd ../client && npm install && cd ../mobile && npm install
```
**Environment variable names (values in your own files, never committed)**
- `server/.env`: `PORT`, `NODE_ENV`, `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_USER_PASSWORD`, `SMTP_*`, `EMAIL_FROM`, `PUBLIC_TRACK_BASE_URL`, `JOBS_ENABLED`, `HOST`, `CORS_ORIGINS`, `RFID_SIMULATOR_ENABLED`, `RFID_DUPLICATE_WINDOW_SEC`, `RFID_DEMO_DEVICE_ID`, `RFID_DEMO_DEVICE_KEY`
- `client/.env`: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (all public)
- `mobile/.env`: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, optional `EXPO_PUBLIC_PREVIEW`
- tests only: `SAMETA_TEST_ADMIN_URL` (a **local** PostgreSQL superuser URL)

**Database.** `cd server && npm run migrate` (applies missing files; see MIGRATIONS.md). Seed the demo: `npm run reset -- --yes` (empties every table, then seeds; **never on a shared database without deciding to**). Before a shared database, follow the five checks in MIGRATIONS.md.

**Logins.** A login needs a Supabase account **and** a `profiles` row with a role and `active` status; the Employee role needs a linked worker record for "My work". The seed prints the demo owner (`owner@everest.demo`) and creates `manager@`, `qc@`, `accounts@` demo accounts.

**Run**
```bash
cd server && npm run dev        # API on 0.0.0.0:4000
cd client && npm run dev        # web on 127.0.0.1:5173
cd mobile && npm start          # then scan the QR code with Expo Go, or press a
```
**Phone connection.** Same Wi-Fi as the computer; `EXPO_PUBLIC_API_URL=http://<computer's IP>:4000`; allow TCP 4000 in the firewall on a private network; check `http://<ip>:4000/health` in the phone's browser first.

**Preview vs live.** *Live* (default): real server and login. *Preview*: `EXPO_PUBLIC_PREVIEW=1` in a development run only, sample data, red banner, saves nothing; it cannot be turned on in a release build (verified by inspecting a release bundle).

**Checks**
```bash
cd server && npm run lint && npm test
cd server && SAMETA_TEST_ADMIN_URL=postgresql://postgres:<pw>@127.0.0.1:5432/postgres npm run test:db
cd client && npm test && npm run build
cd mobile && npm run check && npm test && npx expo-doctor && npx expo install --check && npx expo export --platform android
```

---

## F. Updated SWOT

Internal items are grounded in what was run; external items are reasoned assessments, not market data.

| | Helpful | Harmful |
|---|---|---|
| **Internal** | **Strengths** · One backend serves web and phone; rules live on the server (T). · Dispatch, QC and payroll are transactional and row-locked; concurrency and rollback are *tested* against PostgreSQL. · Retried writes are safe and unconfirmed entries survive a restart (T). · Migrations proven for three histories (T). · RFID pipeline is replay-safe and keeps attendance honest (T, server only). · Readable, honest mobile states (S). | **Weaknesses** · No phone or emulator run: all UI claims are *unverified*. · Idempotency covers output and rolls only; other writes rely on state checks. · The RFID device channel is plain HTTP with a per-IP limit (S). · Two role sets coexist in the demo. · No ESLint/TypeScript for mobile. · The buyer link cannot be revoked. |
| **External** | **Opportunities** *(reasoned)* · The problem statement asks for traceability, buyer visibility and one-place costs, and these now work from a phone. · RFID hardware is in hand: one verified scan makes the story tangible. · Defect analysis and downtime reasons reuse data already collected. | **Threats** *(reasoned)* · Demo-day network, firewall and camera permission issues can fail live. · Supabase availability and the provider's password policy are outside this code (not verified). · A last-minute merge can break a working demo. · RFID UIDs can be cloned: fine for a demonstration, not for real payroll. |

**Responses:** run the device checklist on the demo network beforehand; keep the preview mode and the typed-number fallbacks available; verify the provider password policy once; freeze the tagged commit; mention card cloning honestly.

---

## G. Backlog (not built, deliberately)

| Item | User problem | Overlaps | Backend | Mobile/web | Data / risk | Effort (estimate) | When |
|---|---|---|---|---|---|---|---|
| Defect analytics by machine and dye batch | find the cause of rejects | `/qc/defects`, roll trace peers | one grouped query | one screen | uses existing `qc_defects` and history | 1 to 2 days | next |
| Downtime reasons and duration | "machines sit idle" is not explained | breakdown report | reasons lookup, reason on pause/breakdown | form + report | touches machine status rules: medium risk | 2 days | next |
| Attendance exception report (web) | supervisors need the unresolved list on the web too | mobile "Needs correction", RFID page | none (endpoint exists) | one web panel | low | 0.5 day | next |
| Cost per roll | owner scene "real cost of a roll" | reports exist | verify the report numbers first | order page card | numbers unverified: medium | 2 days | next |
| Revoke or regenerate tracking link | a shared link cannot be switched off | the link feature | token rotate endpoint | button | low | 0.5 day | next |
| RFID hardening | log flood, per-IP limit, plain HTTP | iot route | per-device limiter, cap on unknown-card rows, TLS | none | needs hardware test | 1 day | before pilot |
| New receipt on mobile | store keepers at the gate | receipts | none | item picker, units, lots | form-heavy | 2 to 3 days | later |
| Push notifications | alerts when the app is closed | notifications list | token store, sender | permission flow | needs a build, not Expo Go | 2 days | later |
| Offline entry queue | patchy Wi-Fi on the floor | pending entries (only output and rolls are retry-safe) | idempotency on more writes, conflict rules | queue UI | **do not start** until retry and conflict handling are proven for each write | 1 week+ | later |

---

## H. Review and commit (nothing has been committed)

```powershell
cd C:\Users\Omkar\Desktop\Odoo_26_integration
git status                       # review: the mobile folder is already staged; everything else is working-tree
git diff HEAD --stat             # about 112 files changed plus new files
git add -A                       # includes the new files; client/.env stays untracked and ignored
git status                       # confirm no .env or node_modules appears
git commit -m "Consolidate mobile, RFID and backend fixes; idempotent writes; attendance correction; mobile UI"
git push -u origin integration/sameta-consolidated
```
(Your git identity is unchanged. I added no co-author or attribution text.) The branch is based on `origin/main`, so open a pull request into `main`. It is **not a merge of `omkar`**: the mobile files arrive as new files, and `omkar`'s commit history stays on that branch. To keep that history in this branch's ancestry as well, run `git merge -s ours omkar` **after** committing, then push.

Two items for your own working copy: the three audit documents are untracked in `C:\Users\Omkar\Desktop\Odoo_26\docs` and were not copied here; the earlier audit's finding F-04 was inaccurate (a hard output limit did exist), corrected in finding 7 above.


---

## I. Pre-merge review addendum (second pass)

Done on the same working tree before the manual merge; `origin/main` had **not moved** (still `6b6e1f3`, 0 commits ahead of this branch).

**Found and fixed in this pass**
| Finding | How found | Fix |
|---|---|---|
| **Invalid icon names** (`roll-of-paper`, `spool`) showed a warning toast and a "?" icon on the phone. The first came from the original mobile branch | **Run on an Android emulator** (nothing earlier could catch it) | Valid icons; new `mobile/scripts/check-icons.mjs` (part of `npm run check`) checks every icon name against the font's glyph map |
| Purchase orders page (ported from `omkar`) would show "–" for "For order" in the list | Source comparison with `omkar`'s server fix | `listPos` now returns `for_order_no`; test added |
| Over-target behaviour had been changed to "supervisor may confirm" without your approval | Your instruction to preserve it | Restored: refused for everyone with the original 422; the exception is **off** unless `allow_over_target_override` is set |
| Failed Finish / Pause / Cancel dialogs lost what was typed when reopened | Source review | Values are cleared only after the server accepts them |
| No automated proof that web and phone agree with the server | Your merge brief | `server/test/db/client-contract.test.js` (7 tests): every permission name used by web or phone exists in the catalogue (mutation-checked); every GET and write the phone makes is a real route; the fields the screens read are present in real responses; role-to-menu mapping matches what the server allows |

**Verified on a device (Android 16 emulator, preview mode only):** the app starts; the preview banner shows; dashboard, role-filtered menu (opens from the left), work-order list and detail, machine board render; the numeric keypad appears, the field and the Review button stay visible with the keyboard open; the review dialog, saved banner and toast appear; secure storage reads and writes run without errors. **Not verified on a device:** live mode (no Supabase credentials), camera and scanning, session expiry, TalkBack, large font size, small-phone layouts, QC / dispatch / attendance flows with real data, offline behaviour. Preview mode shows sample data only, so its numbers prove layout, not correctness.

**Visual observations (not defects fixed):** the page title repeats the header title on top-level screens; the tab chips on Attendance scroll horizontally and the last one is clipped at the screen edge.

**Behaviour changes in this branch that need a line in your release notes**
1. `RFID_SIMULATOR_ENABLED` is now **off unless set to `true`** (before: on outside production). Set it in your development `.env` if you use the virtual scanner.
2. The API listens on `HOST` (default `0.0.0.0`).
3. CORS: `CLIENT_URL` plus `CORS_ORIGINS`; any `localhost` port only when `NODE_ENV` is not `production`. **Deployments must set `NODE_ENV=production`.**
4. Payroll now refuses to continue while unresolved RFID check-ins or hourly-paid days without hours exist.
5. Output over the limit still answers 422, now with extra detail in `error.details.over_target`.
