# SAMETA Backend API Integration Contract

This document explicitly defines the mobile app to backend API contracts based on the verified source schemas and services in the `vipul` branch.

## 1. Quality Control & Rolls

### GET `/api/v1/rolls/:rollNo`
Looks up a roll's details.
- **Lookup Constraint:** Only accepts a strictly formatted `roll_no` (string max 40).
- **Discrepancy Note:** *QR tokens cannot be used to fetch roll details via this endpoint.* The mobile app must explicitly require the `roll_no` string to view details.
- **Response Shape (Subset):**
  ```json
  {
    "data": {
      "id": "uuid",
      "roll_no": "R-17-001",
      "status": "pending_qc",
      "length_m": 120,
      "weight_kg": null,
      "item": "Premium Cotton",
      "order_no": "ORD-2026-0017"
    }
  }
  ```

### POST `/api/v1/qc/inspections`
Submits a QC inspection result.
- **Payload Schema:**
  ```json
  {
    "result": "pass" | "rework" | "reject",
    "remarks": "string",
    // EXACTLY ONE of the following:
    "roll_id": "uuid",
    "qr_token": "string (min 8, max 64)"
  }
  ```
- **Discrepancy Note:** Accepts `qr_token` strictly if `roll_id` is omitted. Submitting both fails validation.

### POST `/api/v1/rolls`
Creates a fabric roll at the final stage of production.
- **Payload Schema:**
  ```json
  {
    "work_order_id": "uuid",
    "length_m": 105.5
  }
  ```
- **Discrepancy Note:** The client does **not** generate the `roll_no` or `qr_token`. The backend generates them securely and returns them. `weight_kg` is strictly optional.

## 2. Production Work Orders

### POST `/api/v1/work-orders/:id/logs`
Logs produced quantity against a work order.
- **Payload Schema:**
  ```json
  {
    "qty": 50.0 // strictly > 0, additive increment
  }
  ```
- **Idempotency Note:** *No idempotency keys are supported by the backend.* The `qty` is an additive increment. Mobile implementations must permanently suspend retries on network timeouts and instruct the supervisor to verify the log manually.

### GET `/api/v1/work-orders/:id`
Fetches current progress.
- **Discrepancy Note:** Does NOT return individual log records. It only returns the aggregated `produced_qty` and `target_qty`. Reconciliation is impossible from the client alone.

## 3. Dispatch

### POST `/api/v1/dispatches/:id/scan`
Allocates a roll to a dispatch.
- **Payload Schema:**
  ```json
  {
    // EXACTLY ONE:
    "roll_no": "R-17-001",
    "qr_token": "uuid-string"
  }
  ```

### POST `/api/v1/dispatches/:id/confirm`
Confirms the dispatch and triggers invoicing.
- **Payload Schema:** `{}`
- **Security Note:** Rolls are now safely locked (`FOR UPDATE`) and re-verified at confirmation to prevent race conditions with QC overrides or reassignment.
