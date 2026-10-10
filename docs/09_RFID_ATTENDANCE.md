# RFID attendance

Card scans check workers in through the existing `attendance` table. There is one scan pipeline (`server/src/modules/rfid/rfid.scan.js`). Both the ESP32 endpoint and the in-app virtual scanner call it.

## Decisions

| Topic | Decision | Why |
|---|---|---|
| Organisation | No `org_id` columns. Devices, cards and scans belong to the mill. | One database is one mill (migration 002); the multi-org design was removed. A device can't name a mill, so nothing in a request can cross a tenant boundary. Staff scope (stages/shifts) still applies to card management and lists. |
| Attendance | Reuse `attendance` (one row per worker, date and shift). Add `source` (`manual`/`hardware`/`simulator`) and `check_in_event_id`. | No second attendance system. Wages, the register and the today board pick up RFID check-ins automatically. |
| Check-in only | The first valid scan per shift sets `check_in` and `present`/`late`, with `worked_hours = 0` and `needs_correction = true`. Later scans are logged as `already_checked_in`. | Toggling check-in/out from raw scans is unreliable. The supervisor completes the day, so raw scans never become paid hours. |
| No default shift | Fall back to the running shift. Status is `present`, with no late minutes. | There is no roster to be late against. The board and the README say this. |
| Outside the shift | A rostered worker scanning more than 2 h before the start, or after the end, gets an `accepted` event with `outside_shift` and no attendance. | The scan is kept as evidence without inventing a shift. |
| Duplicates | A scan of the same worker within `RFID_DUPLICATE_WINDOW_SEC` (30 s) of their last accepted scan becomes `duplicate`. The worker row is locked (`for update`) while a scan is processed. | Holding a card on the reader, or two readers at once, gives one check-in. |
| Retries | `eventId` is unique per device. A repeat returns the first answer (advisory lock + lookup). | ESP32 retries after a timeout can't double-count. |
| Device auth | `X-Device-Key` is a 32-byte random key. The server stores only its SHA-256 hash and compares in constant time. Virtual devices have no key and are refused by the hardware endpoint. | Keys are high-entropy, so a slow hash isn't needed. Nothing secret reaches the browser. |
| Simulator | `POST /rfid/simulate` needs a signed-in user with `rfid.simulate`. It is off when `NODE_ENV=production` unless `RFID_SIMULATOR_ENABLED=true`. Demo reset deletes only `source = 'simulator'` rows. | It is a demo tool and must never touch real attendance. |
| Manual grid | Re-saving the supervisor grid keeps a scanned check-in time and source, unless explicit times are sent. | Before, saving the grid would have moved an RFID arrival to the shift start. |

## Schema (migration `020_rfid_attendance.sql`, additive)

- `rfid_devices`: code (unique), name, kind `hardware|virtual`, key_hash, active, last_seen_at. `VIRTUAL_SCANNER` is created.
- `rfid_credentials`: worker_id, card_uid (normalised hex), active, is_placeholder, plus who and when. Partial unique indexes enforce one active owner per card and one active card per worker. Replaced or deactivated cards are kept.
- `rfid_scan_events`: device, source, card_uid, credential, worker (null for unknown), server `scanned_at`, status `accepted|duplicate|unknown_card|invalid_employee|rejected`, attendance_action, attendance_id, shift, request_event_id (unique per device), scanned_by.
- `workers.department` and `workers.work_area`. `attendance.source` and `attendance.check_in_event_id`.
- Permissions: `rfid.view` (also given to every role with `attendance.view`), `rfid.manage` and `rfid.simulate` (Owner). Assign them to other roles in **Roles & permissions**.

## Endpoints

| Method and path | Auth | Purpose |
|---|---|---|
| `POST /api/v1/iot/rfid-scan` | `X-Device-Key` | Hardware scan `{cardUid, deviceId, eventId?}`. Rate-limited to 120/min per IP. |
| `GET /api/v1/rfid/config` | rfid.view | Whether the simulator is on, and the duplicate window. |
| `GET /api/v1/rfid/dashboard?date=` | rfid.view | Live board. The default date is the running shift's date. |
| `GET /api/v1/attendance/rfid` | attendance.view or rfid.view | Recent RFID scans: employee, role, card UID, time, status, device. |
| `GET /api/v1/rfid/events` | rfid.view | Scan log (filters: from, to, worker, status, source; paged). |
| `GET /api/v1/rfid/history` | rfid.view | Attendance rows with source, device and scan result. |
| `GET /api/v1/rfid/cards` | rfid.view | Workers with their current card. |
| `POST/PUT/DELETE /api/v1/rfid/workers/:workerId/card` | rfid.manage | Assign, replace or deactivate a card. |
| `GET/POST /api/v1/rfid/devices`, `POST /rfid/devices/:id/rotate-key`, `PATCH /rfid/devices/:id` | view / manage | Scanners. The key is returned once. |
| `POST /api/v1/rfid/simulate` | rfid.simulate | Virtual scan `{card_uid}` or `{worker_id}`. |
| `POST /api/v1/rfid/demo/reset` | rfid.simulate + rfid.manage | Delete simulator scans and their check-ins. |

`GET /workers` also returns `department`, `work_area`, `rfid_uid` and `rfid_placeholder` (the RFID fields need `rfid.view`).

## Demo setup

```bash
# server/
npm run migrate
npm run seed:rfid      # idempotent, dev only: DEMO-RAVI/PRIYA/ARJUN/MEENA with their physical cards + scanner GATE_01 (key in server/.env)
```

| Employee | Role | Area | Card UID (physical) |
|---|---|---|---|
| Ravi (DEMO-RAVI) | Weaver | Loom 01 | 72FAC35C |
| Priya (DEMO-PRIYA) | Dyeing Operator | Dyeing 01 | 31636E40 |
| Arjun (DEMO-ARJUN) | QC Inspector | QC Station | 91B76E40 |
| Meena (DEMO-MEENA) | Production Supervisor | Production Floor | 51278B40 |

Re-running the seed never overwrites a card that has been replaced in the app.

UI: **People → RFID attendance** has the Live board with the virtual scanner, plus Cards, Scanners and History. **People → Workers** shows each worker's card and has Assign, Replace and Deactivate actions.

Hardware: see `iot/esp32-rfid-attendance/README.md`.
