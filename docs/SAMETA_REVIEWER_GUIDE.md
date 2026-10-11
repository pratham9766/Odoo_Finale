# SAMETA reviewer / viva guide

Each section answers: what it does, why it exists, how it works in this code, where it is enforced, what happens when it fails, and what is still limited. File names are real; line numbers are deliberately left out because they change. Anything not tested is said so.

---

## 1. Authentication versus authorisation
- **What.** Authentication proves who you are; authorisation decides what you may do. They are different failures: `401` (not logged in or token invalid) versus `403` (logged in, not allowed).
- **Why.** A valid login must never mean access: a person can sign up to Supabase and still have no role.
- **How.** `server/src/middleware/auth.js` verifies the Supabase JWT against the project's public keys and sets the user id. `middleware/staff.js` then loads the person's role and permissions **from our own database on every request** and refuses people with no role (`NOT_STAFF`) or a disabled account. Each route then says `can('qc.inspect')` and so on (`middleware/rbac.js`). Scope (which machines or stages a supervisor may touch) is in the same loaded context.
- **Where enforced.** Only on the server. The apps hide buttons for convenience, but the server is the authority.
- **If it fails.** `401` makes the phone renew its token once (section 11); `403` is shown as "Not allowed" and never retried.
- **Limits.** The permission lookup is one query per request: fine at this size. Not tested against the real Supabase.

## 2. Password validation and the provider's policy
- **What is in the repository.** The password-reset form checks in the browser only (`client/src/features/ResetPassword.jsx`: at least 8 characters, a letter, a number) and then Supabase decides. The **server** enforces a password only when someone joins by invite (`server/src/modules/auth/me.schema.js`: 8 to 72 characters, at least one letter and one number).
- **What is not.** The actual sign-in password policy (minimum length, leaked-password check, rate limits) is **a Supabase project setting**. There is no evidence of it anywhere in this repository, so it cannot be claimed. To state it: check Supabase → Authentication → Policies.
- **Why it matters.** Client checks are advice; the provider and the server enforce.

## 3. Backend versus frontend validation
- **Rule.** The frontend validates to help; the backend validates because it must.
- **How.** Every route runs a zod schema (`validate({ body: … })`) before the service. Examples: output `qty` must be positive with at most 3 decimals (`workOrderActions.schema.js`), correction times must be ordered and not in the future (`attendance.service.js`), idempotency keys must match a pattern. The phone repeats some checks (for example in `attendanceTime.js`) only to explain a problem sooner.
- **If it fails.** `422` with the field and message; nothing is stored.
- **Limits.** Database constraints back the important ones (`qty > 0`, unique roll in a dispatch).

## 4. Transactions and row locks
- **What.** A transaction makes several changes happen together or not at all; a row lock (`select … for update`) makes two people wait their turn on the same record.
- **Why.** Two scanners can reach for the same roll at once; a confirmation must create the invoice **and** mark the rolls, or neither.
- **How.** `db/tx.js` (`withTx`) wraps each request. Dispatch: the dispatch row and each roll are locked; `confirm.service.js` changes the dispatch, the rolls, the history and the invoice in one transaction; a unique constraint on `dispatch_rolls(roll_id)` is the final judge in a race.
- **Evidence.** `server/test/db/dispatch.test.js`: two dispatches racing for one roll (exactly one wins), three simultaneous confirmations (one succeeds, one invoice), and a forced invoice failure (everything rolls back).
- **Limits.** Locks wait rather than fail; no timeout policy beyond PostgreSQL's defaults.

## 5. Idempotency
- **What.** Doing the same request twice has the effect of once.
- **Why.** On a weak network a phone can send a request, the server can save it, and the answer can get lost. A retry would count the output twice.
- **How.** The phone makes one key per entry, **saves the entry on the phone before sending**, and sends the key as `Idempotency-Key`. On the server (`utils/idempotency.js`), inside the same transaction as the change: lock on (user, operation, key); if the key exists and the input is the same, return the stored answer; if the input differs, `409`; otherwise do the change and store the answer. A failed request stores nothing. The key is private to the user and the operation. The phone keeps unconfirmed entries across restarts and offers "Check if saved" (`GET /idempotency/…`, read-only) and "Send again" (same key).
- **Evidence.** `idempotency.test.js`: lost response, 40 simultaneous requests over five keys record each entry once, changed input is a conflict, per-user scope, failure leaves nothing. Removing the lock makes those tests fail. Phone side: `submissions.test.js`.
- **Limits.** Covered: output and roll creation. Other writes rely on state checks (a second QC inspection or confirmation gets `409` and the screen shows the truth). Without the header an older client is unprotected.

## 6. Production logs versus rolls
- **Production log** (`POST /work-orders/:id/logs`): "this machine made another 12 metres". A number added to the work order; no label, no QC.
- **Roll** (`POST /rolls`): one physical piece of fabric with a number (`R-17-001`), a QR label, a length and weight; it enters the QC queue and can be traced and dispatched.
- **Why separate.** Output is continuous and approximate; a roll is discrete and individually inspected. Mixing them would make traceability impossible.
- **Rule.** Rolls can only be created at the last stage. The phone shows them as two separate steps with different wording.

## 7. QC eligibility
- **What.** Only a roll waiting for QC (`pending_qc`) can be inspected; only a `passed` (or already `packed`) roll can be put on a dispatch; a `packed` or `dispatched` roll cannot be overridden.
- **Where.** `quality/inspections.service.js` (locks the roll, checks its status), `dispatch/dispatches.service.js` (`ROLL_NOT_PASSED`, wrong order, already dispatched, 5 % quantity tolerance), `confirm.service.js` (re-checks under lock). Result names: request `pass | rework | reject`, stored status `passed | rework | rejected`.
- **If it fails.** `409` with a reason; the phone says what to do (for example "send it to QC").
- **Evidence.** `dispatch.test.js` (override of a packed or dispatched roll is refused).
- **Limits.** A QC head can still override `passed → rejected` before packing; it is audited and requires a reason.

## 8. Attendance correction
- **What.** A card scan only proves arrival. The day stays **unresolved** (`needs_correction`, 0 hours) until a supervisor enters the real check-out.
- **Why.** The earlier behaviour paid an hourly worker 0 hours for a badge-in without any warning, and guessing a check-out (for example the shift end) would invent data.
- **How.** `GET /attendance/unresolved`; `POST /attendance/:id/correct` with explicit times and a reason (5+ characters). The server validates order, not in the future, at most 20 hours, scope; recalculates hours with the same shift rules as the grid; stores who, when and why; writes an audit row. The correction is refused once the month's wage run is approved or paid. Payroll preparation and approval refuse while any ended-day card check-in is unresolved (`ATTENDANCE_UNRESOLVED`) or an hourly-paid worker has a worked day with no check-out (`HOURS_MISSING`); a shift that may still be running (checked in under 20 hours ago) is not counted.
- **Where enforced.** `workforce/attendance.service.js` and `wages.service.js`. Separation of duties (preparer ≠ approver, when another approver exists) is unchanged.
- **Evidence.** `attendance.test.js` (13 tests) and `http.test.js`.
- **Limits.** The web has no dedicated correction list (the mobile screen and the attendance grid do the job). A second scan is deliberately not treated as check-out.

## 9. Query caching versus real-time updates
- **Reality.** Both apps use TanStack Query: results are cached, shown immediately, refetched on a timer (30 to 120 seconds) and after every action. The server has a socket emitter, but **neither client subscribes**. So screens are "fresh within a minute", not instant.
- **How the phone is honest about it.** Each list shows "Updated hh:mm" with a refresh button; if a refresh fails the last data stays under a banner that says it is old; a user switch clears the cache; after any write every cached read of that user is refetched.
- **Limit.** Two people can look at slightly different numbers for up to a minute.

## 10. Mobile versus web responsibilities
- **Phone:** the shop floor: output, rolls, QC, scanning, dispatch, attendance and corrections, stock view, goods-receipt posting, order status and buyer link, "My work". Quick, one-handed, interruption-tolerant.
- **Web:** planning, masters (items, BOMs, buyers, machines, workers), purchasing, finance, wages, reports, staff and roles, settings, RFID administration.
- **Why.** The phone is used standing at a machine with gloves; finance and administration need large screens and are rarely urgent. Both call the **same** API and rules; the phone has no business logic of its own.
- **Limit.** New goods receipts and purchase orders are web only.

## 11. Session refresh
- **What.** Supabase tokens expire (about an hour). A 401 means the server stopped before doing anything.
- **How.** `services/auth/authorizedApi.js`: every call reads the current token; on 401 the session is refreshed **once** however many calls failed together; reads and keyed writes are then retried; an unkeyed write is **not** replayed (the person is told to tap again); a 403 is never answered by refreshing; if the refresh token itself is invalid the person is signed out; if the phone is simply offline they stay signed in. When the app returns to the foreground the Supabase refresh timer is restarted. Sign-out works offline (local sign-out always runs).
- **Evidence.** `submissions.test.js` (refresh storm, retry rules, fatal versus offline). **Not tested** against real Supabase or on a device.

## 12. Migrations
- **How.** The runner applies each missing file once, in sorted name order, recording the **full file name**; no checksums. So two branches that each made a 019 and a 020 do not collide, and renaming would have made databases re-run them.
- **The one trap.** Order-dependent effect on `rfid.view`, fixed by migration 022 for roles nobody edited. Proven for fresh, main-first and mobile-first databases in `migrations.test.js`.
- **Limit.** A shared database's history was not inspected: see MIGRATIONS.md for the five checks.

## 13. Preview mode versus live mode
- **Live:** real server, real login, real data. **Preview:** development only (`EXPO_PUBLIC_PREVIEW=1` in a development bundle): sample data, no server, no login, a red banner on every screen, nothing saved.
- **Why it cannot become a login bypass.** It signs nobody in, calls no network, and its code is not present in a release bundle (verified by inspecting a release export made with the flag on).

## 14. RFID in one paragraph
Card → ESP32 → `POST /api/v1/iot/rfid-scan` with a device key (stored only as a SHA-256 hash, compared in constant time) → one transaction: card → worker → duplicate and replay check → shift window → check-in on the existing attendance table. Unknown, inactive and deactivated cards are recorded and rejected. **Limits:** firmware not compiled, no hardware scan done here; plain HTTP; per-IP rate limit; card UIDs can be cloned, so this is a demonstration of attendance capture, not secure payroll identity.

---

## Questions a reviewer might ask

1. *If my phone loses signal after I tap "Add output", how do you stop it being counted twice?* (section 5; the entry stays "Unconfirmed", "Check if saved" asks the server, "Send again" reuses the same key.)
2. *Why don't you just disable the button?* Because the request may already have been saved; only the server can know. A disabled button does not help after the app is restarted.
3. *What happens if two clerks scan the same roll into two trucks?* (section 4; the unique constraint and the roll lock: exactly one succeeds, the other is told which dispatch has it.)
4. *Can an operator log 5000 metres by typing an extra zero?* No: above target × 1.25 (the percentage is a mill setting) the entry is refused for everyone, as it was before. An optional supervisor exception exists but is switched off unless the mill turns it on; it needs a reason and is audited.
5. *Why isn't a badge-in enough for payroll?* It proves arrival, not hours (section 8); payroll refuses to run until the check-out is entered.
6. *Why does QC need a roll to be identified before the decision?* So a scan of the wrong label is caught by a person reading the roll number and order, not after the result is saved.
7. *Is the phone showing live data?* No: fresh within about a minute, and it says when it last updated (section 9).
8. *What stops a stolen buyer link from being used for ever?* Nothing today: no expiry or revocation. It shows no prices or worker data, and the phone warns before sharing. A revoke button is in the backlog.
9. *Why is the migration for RFID numbered 020 twice?* (section 12.)
10. *What was not tested?* Everything on a real phone, real Supabase login and refresh, the ESP32, shared-database upgrade, load, and security review beyond the code paths above.
