# SAMETA API contracts (verified from source)

Every statement here was read from the code in this branch, and the ones marked **tested** are exercised by `server/test/db/*.test.js` against a real PostgreSQL (`npm run test:db`). Paths are under `/api/v1`. Responses are `{ "data": … }`, optionally with `"meta"`; errors are `{ "error": { "code", "message", "details"? } }`.

## Architecture facts that old documents get wrong

| Fact | Evidence |
|---|---|
| **One mill per database. There is no organisation / tenant concept.** | `db/migrations/002_mill_and_users.sql` (`mill.id boolean primary key default true check (id)`, "One system = one mill"). No request header or column selects a mill. |
| The mobile app used to send an `x-org-id` header. **Nothing on the server reads it**; it was removed. | `grep` over `server/src` finds it only in stale comments. |
| **Production output and roll creation are two different operations.** Output is a quantity added to a work order (`POST /work-orders/:id/logs`). A roll is a physical, numbered, labelled record (`POST /rolls`) that enters QC. | `productionLogs.service.js` vs `rolls.service.js` |
| **QC inspection is `POST /qc/inspections`** (not PATCH). The request `result` is `pass \| rework \| reject`; the roll's stored status becomes `passed \| rework \| rejected`. There is no `approved` status. | `quality.routes.js`, `quality.schema.js`, `inspections.service.js` (`STATUS_FOR`) |
| **Dispatch has a dedicated `POST /dispatches/:id/confirm`.** `POST /dispatches/:id/status` only accepts `in_transit` or `delivered`. | `dispatch.routes.js`, `dispatch.schema.js` (`statusSchema`) |
| **QR tokens**: `POST /dispatches/:id/scan` (`code` \| `roll_no` \| `qr_token`), `POST /qc/inspections` (`qr_token`), and, since this branch, `GET /rolls/:code` and `GET /rolls/:code/trace` (a roll number **or** a QR token). Before this branch the two `GET /rolls` routes accepted only a roll number. | `rolls.service.js` `rollByNo`; **tested** (`http.test.js`) |
| **The web app does not update instantly.** The server has a socket.io emitter (`server/src/realtime/socket.js`) but the web client has no socket dependency and uses polling (`refetchInterval`, 15 places) plus refetch after each action. The mobile app also polls; its realtime service is an unused stub. Screens say "Updated hh:mm". | `client/package.json`, `client/src`, `mobile/src/services/realtime/realtimeService.js` |

## Authentication and authorisation

- **Authentication** = who you are: a Supabase JWT, verified by `server/src/middleware/auth.js` against the project JWKS. Failure → `401` (`UNAUTHENTICATED`, `INVALID_TOKEN`).
- **Authorisation** = what you may do: `staff` middleware loads the person's role and permissions from the database on every request (`NOT_STAFF` / `ACCOUNT_DISABLED` → `403`); each route then checks `can(permission)` (`FORBIDDEN` → `403`) and optionally `requireModule`.
- The two are separate on purpose: a valid login with no role gets `403`, never data.

### `GET /me/access` (any signed-in user)
`{ staff: false, mill: { name } }` when signed up without a role, otherwise
`{ staff: true, status, mill: { name, modules }, user: { id, email, full_name }, role: { id, name, rank }, permissions: string[], scope: {} }`.

### `GET /me/work?month=YYYY-MM` (any active staff; no permission)
Filtered to **this login only** (`workers.user_id = req.user.id`). Unlinked staff get `{ linked: false, month, profile, access }`. Linked: adds `worker`, `today { assignments, attendance }`, `summary`, `attendance[]`, `output[]`, `payslips[]`. `month` must match `YYYY-MM` (`422` otherwise). **Tested** (`http.test.js`): an operator linked to a worker sees only that worker's rows; an unlinked login gets `linked:false`.

## Production

| Operation | Request | Permission | Notes |
|---|---|---|---|
| `GET /production/board?mine=true&stage_id=` | query | `production.view`, scope-filtered | `{ kpis, machines[] }`. `mine=true` = machines **assigned to the caller for the current shift** (that is the only personal filter) |
| `GET /work-orders` , `GET /work-orders/:id` | CRUD list | `production.view` | **Not personal**: every work order of the mill. Includes `pct`, `uom`, `machine_code`, `item`, `stage`, `order_no` |
| `POST /work-orders/:id/start` , `/resume` | none | `production.log` | `planned\|paused → running`; the machine must be `idle` |
| `POST /work-orders/:id/pause` | `{ reason? }` | `production.log` | `running → paused` |
| `POST /work-orders/:id/finish` | `{ good_qty, waste_qty?, good_weight_kg?, waste_type?, waste_item_id? }` | `production.log` | `running\|paused → done`; output limited like logs |
| **`POST /work-orders/:id/logs`** | `{ qty, worker_id?, shift_id?, confirm_over_target?, reason? }` + header `Idempotency-Key` | `production.log` | `qty > 0`, ≤ 3 decimals (`numeric(14,3)`). Work order must be `running`. **`201`** `{ data: { log, work_order: { produced_qty, target_qty } }, meta: { replayed: false } }`; a retry with the same key and input → **`200`** with the original data and `meta.replayed: true`; same key with other input → `409 IDEMPOTENCY_KEY_REUSED`. **Tested** |
| Over-target rule | | | **Blocked, as before.** Output above `target × (1 + pct/100)` is refused with `422 VALIDATION_FAILED` (field `qty`, the same message and status that existed before this branch); the response also carries `error.details.over_target` (`limit`, `would_be`, `over_target_pct`, `override_allowed`). `pct` = `mill.settings.production.over_target_pct`, **default 25** (the limit that was already a constant). **There is no approval workflow unless the mill switches one on**: `mill.settings.production.allow_over_target_override` (default **off**). Only then may someone with `production.plan` resend with `confirm_over_target: true` and a `reason` (audited as `production_over_target`); with the setting off that flag is refused (`403`). **Tested** both ways |
| `GET /idempotency/:operation/:key` | `operation` ∈ `production.log`, `roll.create` | any staff, **own keys only** | `{ found: false }` or `{ found: true, response, recorded_at }`: lets a phone ask whether an unconfirmed entry was saved. Changes nothing. **Tested** |

### Idempotency (how a retry is made safe)
`server/src/utils/idempotency.js`. One `Idempotency-Key` (16–80 chars `A-Za-z0-9_-`) per logical entry, scoped to **(signed-in user, operation)**. Inside the same transaction as the business change: take an advisory lock on `(user, operation, key)`, return the stored response if the key exists (hash of the validated input must match), otherwise run the change and store `{ request_hash, response }`. Unique primary key `(actor_id, operation, key)` in `idempotency_keys` (migration 021). A failed request stores nothing, so the same key can be retried after the cause is fixed. Rows older than 14 days are removed. The header is optional (older clients keep working) but without it a retry is **not** safe.

## Rolls, trace, QC

| Operation | Request | Permission | Notes |
|---|---|---|---|
| **`POST /rolls`** | `{ work_order_id, length_m (≤10000), weight_kg?, dye_batch? }` + `Idempotency-Key` | `production.log` | WO must be `running\|paused\|done` and at the **last stage**. New roll status `pending_qc`, number `R-<order>-<nnn>`. `201` / `200 replayed`. **Tested** |
| `GET /rolls/:code` | roll number **or** QR token | `qc.view` or `production.view` | the roll row (`status`, `wo_no`, `machine_code`, …) |
| `GET /rolls/:code/trace` | same | `qc.view` | `{ roll, timeline[], raw_material_lots[], inspections[], dispatch\|null, peers }`. `404` when unknown. **Tested** |
| `GET /qc/queue?status=` | `pending_qc\|passed\|rework\|rejected` | `qc.view` | |
| **`POST /qc/inspections`** | `{ roll_id \| qr_token, result: pass\|rework\|reject, defects[{defect_type_id,count,severity}], remarks?, photo_path? }` | `qc.inspect` | Only `pending_qc` rolls (`409 INVALID_STATE_TRANSITION` otherwise). rework/reject need ≥ 1 defect. rework creates a rework work order; reject scraps. Row-locked |
| `POST /qc/inspections/:id/override` | `{ result, reason, defects[], remarks? }` | `qc.override` | allowed for `pending_qc\|passed\|rework\|rejected` only; a **packed or dispatched roll is refused** (`409`). Audited. **Tested** |

## Dispatch

| Operation | Request | Permission | Notes |
|---|---|---|---|
| `POST /dispatches` | `{ order_id, vehicle_no?, driver_name?, driver_phone? }` | `dispatch.create` | order must be in production / QC / ready / partially dispatched |
| **`POST /dispatches/:id/scan`** | `{ code \| roll_no \| qr_token }` | `dispatch.create` | `201`. Refusals (`409`): `ROLL_WRONG_ORDER`, `ROLL_NOT_PASSED`, `ROLL_ALREADY_DISPATCHED`, `QTY_EXCEEDS_ORDER` (> ordered × 1.05). Roll → `packed`. **The same roll scanned again into the same dispatch is not an error**: it answers `already_scanned: true` and changes nothing. Race for one roll between two dispatches: exactly one wins (`unique(roll_id)` + roll row lock). **Tested** |
| `DELETE /dispatches/:id/rolls/:rollId` | | `dispatch.create` | only while `packing`; roll → `passed` |
| **`POST /dispatches/:id/confirm`** | none | `dispatch.confirm` | `packing → confirmed`; locks the rolls, re-checks order / status / quantity, creates the invoice **in the same transaction**; rolls → `dispatched`. A second concurrent confirm gets `409 INVALID_STATE_TRANSITION`. Any failure (e.g. invoice creation) rolls everything back. **Tested** |
| `POST /dispatches/:id/status` | `{ status: in_transit \| delivered }` | `dispatch.confirm` | `confirmed → in_transit → delivered` |

## Receipts and stock

`GET /stock` (`stock.view`; each row has `on_hand`, `reserved`, `available`, `reorder_level`, `is_low`, `uom`), `GET /stock/finished`, `GET /receipts`, `GET /receipts/:id` (`receipt.view` or `stock.view`), `POST /receipts` (`receipt.create`), `POST /receipts/:id/post` (`receipt.post`; draft → posted, adds stock), `POST /receipts/:id/cancel` (`receipt.delete`). **Receipt creation is not in the mobile app** (web only).

## Attendance and wages

| Operation | Request | Permission | Notes |
|---|---|---|---|
| `GET /attendance`, `/attendance/today`, `/attendance/register` | queries | `attendance.view` | scope-filtered |
| `POST /attendance/bulk` | `{ date, shift_id, entries[{ worker_id, status, check_in?, check_out? }] }` | `attendance.mark` | the supervisor's grid. Closing an unresolved row here also records who and when (reason "Corrected in the attendance grid") |
| **`GET /attendance/unresolved?from=&to=`** | | `attendance.view` | card check-ins with no check-out (`needs_correction`). Each row has `payroll_locked` (its month's wage run is approved/paid). **Tested** |
| **`POST /attendance/:id/correct`** | `{ check_out, check_in?, reason (5–300) }` | `attendance.mark` | explicit times only, **nothing is derived from the shift end**. Validates `check_out > check_in`, not in the future, ≤ 20 h; recalculates hours/overtime/late/status with the grid's rules; records `corrected_by/at/reason` + an audit row. Refused (`409 PAYROLL_LOCKED`) when the month's wage run is approved or paid; scope-checked (`403 OUT_OF_SCOPE`). **Tested** |
| `POST /wages/runs` | `{ month: YYYY-MM }` | `wages.run` | **`409 ATTENDANCE_UNRESOLVED`** while a day that has ended still has an unresolved card check-in, **`409 HOURS_MISSING`** for an hourly-paid worker marked present with no check-out. A shift that may still be running (checked in < 20 h ago) is not counted. **Tested** |
| `POST /wages/runs/:id/approve`, `/pay` | | `wages.pay` | same guard re-checked; approver ≠ preparer when another approver exists; payment only after approval |

## RFID

`POST /iot/rfid-scan` (no session; header `X-Device-Key`, body `{ cardUid, deviceId, eventId? }`). Device key stored as SHA-256 and compared in constant time; 120 requests/minute per IP; the same `(device, eventId)` is answered, not repeated. Every scan is stored; a valid one checks the worker in through the **existing** `attendance` table and leaves the day **unresolved** (`needs_correction`, 0 hours) until a supervisor enters the check-out. Statuses: `accepted`, `duplicate`, `unknown_card`, `invalid_employee`, `rejected`. The virtual scanner (`POST /rfid/simulate`) is **off unless `RFID_SIMULATOR_ENABLED=true`**, never rewrites an existing attendance row, and its reset (`POST /rfid/demo/reset`) deletes only uncorrected simulator rows and refuses months whose wage run is approved or paid. **Tested** (offline rules + database).

## Buyer tracking link

`POST /orders/:id/tracking-link` (`orders.view`) creates the order's token **once** (24 random characters) and returns the same one afterwards: `{ token, url }`. `GET /public/track/:token` (no login, rate limited) returns only what `public_track()` selects: order number, mill name, status, progress, current stage, deadline, expected completion, item lines (description, colour, quantity, unit) and events marked `visible_to_buyer`. **No prices, costs, or worker data.**
**Limitation:** there is no expiry and **no way to revoke or regenerate** a token. The mobile app therefore shows a plain warning before it shares a link, and only offers it to users who already have the same right on the web (`orders.view`, order not cancelled).
