# Backend Integration Contracts

This document specifies the required integrations and endpoints needed by the SAMETA mobile application to achieve feature parity with the web client.
All integrations will use the `IntegrationUnavailableError` placeholder pattern until the endpoints exist.

## Common Requirements
- **Headers**: All authenticated endpoints require `Authorization: Bearer <jwt>` and `x-org-id: <org-id>`.
- **Response Format**: Expected `{ data: any, meta?: any, error?: any }`.

## Modules

### Authentication (`src/services/auth/authService.js`)
* Status: **Missing**
* Endpoints:
  - `POST /auth/login` (email, password) -> JWT
  - `POST /auth/signup`
  - `POST /auth/recover`

### Organization Context (`src/services/api/orgApi.js`)
* Status: **Missing**
* Endpoints:
  - `GET /me/orgs`
  - `GET /me/orgs/:id/context`

### Orders (`src/services/api/ordersApi.js`)
* Status: **Missing**
* Endpoints:
  - `GET /orders`
  - `GET /orders/:id`
  - `GET /orders/:id/requirements`

### Production (`src/services/api/productionApi.js`)
* Status: **Missing**
* Endpoints:
  - `GET /production/board`
  - `GET /production/work-orders`

### Quality (`src/services/api/qualityApi.js`)
* Status: **Missing**
* Endpoints:
  - `GET /qc/queue`
  - `GET /rolls/:rollNo`
  - `POST /qc/inspect`

### Inventory (`src/services/api/inventoryApi.js`)
* Status: **Missing**
* Endpoints:
  - `GET /inventory/stock`
  - `GET /inventory/receipts`
  - `POST /inventory/receipts`

### Dispatch (`src/services/api/dispatchApi.js`)
* Status: **Missing**
* Endpoints:
  - `GET /dispatch`
  - `GET /dispatch/:id`
  - `POST /dispatch/:id/scan`
  - `DELETE /dispatch/:id/scan/:rollNo`
  - `POST /dispatch/:id/confirm`

### Realtime & Notifications
* Status: **Missing**
* Components:
  - `src/services/realtime/realtimeService.js` (Websockets for live updates)
  - `src/services/notifications/notificationService.js` (Expo push tokens)
