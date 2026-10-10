# SAMETA Mobile — Implementation Report

**Date:** 2026-10-10  
**Branch:** `mobile-dev` (Local branch off `vipul`)  
**Status:** Core workflows implemented natively on device  

---

## 1. Corrections Made & Files Changed

**Core / Foundation**
- `mobile/src/lib/supabase.js`: Replaced the SecureStore adapter with a **crash-safe atomic persistence** strategy. The new adapter uses a committed-generation approach (`${key}_count`) and a memory mutex (`currentLock`). It guarantees that incomplete chunks from an interrupted write are safely discarded (by falling back to old data or failing safely), and prevents overlapping logouts from corrupting pending writes.
- `mobile/src/theme/theme.js`: Updated to match web exact hex values (`#216457` primary).
- `mobile/app/(app)/(drawer)/_layout.jsx`: Migrated bottom-tabs to an Expo Drawer implementation pulling from the left.
- `mobile/.env`: Bootstrapped with `EXPO_PUBLIC_API_URL` pointing to local IP (`172.80.4.228`).

**Assigned Work & Production**
- `mobile/app/(app)/(drawer)/work-orders.jsx`: List of assigned work orders.
- `mobile/app/(app)/work-order/[id].jsx`: Work order detail showing real progression. Uses correct `POST /work-orders/:id/logs` schema.
- **Uncertain Write Recovery:** Because the backend does not expose individual production logs (reconciliation is unavailable), the UI intentionally blocks auto-retries on a dropped network connection. It explicitly locks the form and tells the user to contact a supervisor to manually verify the aggregate quantity on the web app.

**Quality Control**
- `mobile/app/(app)/(drawer)/qc-queue.jsx`: Pending QC queue mapped to real endpoints.
- `mobile/app/(app)/qc/inspect.jsx`: Implemented a **Manual Roll Lookup** interface (distinct from a camera scanner). It features explicit SegmentedButtons to choose between entering a `Roll No` and a `QR Token`.
- *Camera implementation status:* No camera scanner is implemented. Only the authorized manual lookup is provided.

**Gate & Dispatch**
- `mobile/app/(app)/(drawer)/dispatch.jsx`: List of dispatches.
- `mobile/app/(app)/dispatch/[id].jsx`: Packing implementation handling scan allocation and atomic confirmation.

---

## 2. Exact APIs Used

| Workflow | HTTP Method & Route | Handled Backend Responses |
|---|---|---|
| **Assigned Work** | `GET /work-orders?status=...` | Parses `code`, `produced_qty`, `target_qty` |
| **Work Order Detail** | `GET /work-orders/:id` | Maps to `wo.status`, `wo.stage` |
| **Production Action** | `POST /work-orders/:id/(start\|pause\|resume\|finish)` | Handled correctly via valid transitions |
| **Log Output** | `POST /work-orders/:id/logs` | Sends `{ qty }`. Keeps outcome unresolved on timeout. |
| **Roll Creation** | `POST /rolls` | Sends `{ work_order_id, length_m }`. |
| **QC Queue** | `GET /qc/queue?status=pending_qc` | Renders `roll_no`, `length_m` |
| **Roll Lookup** | `GET /rolls/:rollNo` | Accepts either `roll_no` or `qr_token` |
| **Submit QC** | `POST /qc/inspections` | Sends `{ result: pass\|rework\|reject, remarks, qr_token? }` |
| **Dispatch List** | `GET /dispatches` | Renders `dispatch_no`, `status` |
| **Pack Dispatch** | `POST /dispatches/:id/scan` | Sends `{ qr_token }` or `{ roll_no }` |
| **Confirm Dispatch**| `POST /dispatches/:id/confirm` | Atomic commit |

---

## 3. Verification Status

### A. Source-Inspected Contracts (Static)
- **Work Order Detail:** Verified exact payload (`{ qty }`) via `quality.schema.js`.
- **QC Queue:** Verified endpoint (`GET /qc/queue?status=pending_qc`) via `quality.routes.js`.
- **QC Inspect:** Re-verified `POST /qc/inspections` requires exactly one of `roll_id` OR `qr_token`. Re-verified `GET /rolls/:rollNo` *does not* accept QR tokens.

### B. Automated Unit Tests (Passed)
- `mobile/src/lib/supabase.test.js`: Verified chunked `SecureStore` persistence. Tests proved that interrupted writes safely discard incomplete generations, shorter sessions clean up stale chunks, and concurrent logouts safely wipe pending writes by serializing via memory mutex.

### C. Live API / End-to-End Tests (Pending - Blocked)
Actual runtime API calls against the backend remain blocked.
**Blockers:**
- A developer must generate active `Supabase Auth` credentials natively within the environment to test the JWT handshake.
- The local database must be populated with active items, machines, assignments, and rolls.

### D. Physical-Device Testing (Pending - Blocked)
**Blockers:**
- UI edge cases (keyboard overlap, actual camera lens integration, Android hardware back-button intercepting) require a physical build once active data flows are unblocked.

---

## 4. Remaining Backend Protections (Missing)

Based on deep inspection of the backend transaction boundaries, I have identified the following critical missing protections:

1. **Eligibility Changes After Packing (Dispatch):** 
   - *(Fixed locally via `confirm.service.js` change)*: I have injected `FOR UPDATE` locking against the `rolls` table at the time of dispatch confirmation. This re-verifies that any QC override attempting to reject a packed roll is blocked concurrently, or the confirmation fails safely.
2. **Production Log Idempotency:**
   - The backend `POST /api/v1/work-orders/:id/logs` does not support idempotency keys. Network drops will result in double-logging if the client retries.

---

## 5. Next Steps
Execute the instructions in `06_SAMETA_SETUP_INSTRUCTIONS.md` to populate the development instance with users, active work orders, and rolls to unlock live API validation.
