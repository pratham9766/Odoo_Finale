# Sameta: 24-hour delivery agreement

Activated 2026-10-10. Source: `01_OVERALL_PLAN.md` sections 2, 11–19 and the frontend/backend execution plans. The six scenes in that document are the requirements baseline; this is not independent verification of the PDF or event rules. H0 means implementation start, not an official deadline. Current assignment: Member B (frontend).

## Requirements and acceptance criteria

| ID | Required outcome | Acceptance evidence |
|---|---|---|
| R1 | Material receipt and stock | Record lot, yarn type, colour, quantity/unit, supplier, rate and optional order; reload preserves receipt; ledger balance increases exactly once. Reject negative quantities. |
| R2 | Availability and low stock | Show on-hand minus active reservations; flag below reorder level; order requirements identify available and short quantities. Two concurrent confirmations cannot reserve the same stock. |
| R3 | Production visibility | Board shows each machine's stage, status, order, operator, shift and output. Log output, record breakdown/resolution and change assignments; another session sees updates within 30 seconds. Reject impossible quantities and overlapping assignments. |
| R4 | QC and genealogy | Create uniquely numbered rolls linked to order, machine and material lot; record defect type/count and pass/rework/reject. Passed, rejected and waiting totals reconcile. Rework retains inspection history. |
| R5 | Order tracking | Orders support multiple fabric/colour/quantity lines and deadlines. Status/progress derives from production, QC and dispatch; buyer receives only their order summary without mill cost/worker details. |
| R6 | Dispatch and invoice | Select only passed rolls belonging to the correct order/buyer. Concurrent duplicate scans yield one success. Confirm atomically records shipped stock and an invoice matching roll quantities; retry cannot create another invoice. |
| R7 | Workforce and wages | Record attendance, shift and worker allocation; calculate approved daily/hourly/piece wages consistently; night shifts belong to their starting date. Owner sees wages paid. |
| R8 | Cost and accounts | Record supplier bills, buyer invoices/payments and expenses. Report material, labour, overhead and loss per order, output per machine and period profit. Avoid charging material/wages twice through both cost of goods and expenses. |
| R9 | Persistence and security | Restart preserves data; server validates writes, tenant membership, permission and resource scope. Buyers cannot retrieve private fields by altering URLs or payloads. No service keys in client bundle. |
| R10 | Usability and resilience | All core pages work at 360px and desktop; required fields, loading/empty/error/retry states and keyboard labels. Manual roll entry if camera fails. Preserve entered form after failed submission. |

## Feasibility and hidden challenges

The full multi-portal SaaS plan is too broad for 96 person-hours. Deliver all six scenes in one mill first, with a second org for isolation tests and minimal buyer tracking. Keep the documented React/Express/Supabase approach because the team already has contracts for it. Do not implement a new framework during the event.

Critical technical risks: decimal quantities and mixed units; reservation races; partial production/dispatch; QC rework double counting; tenant references to another org's rows; shared B2B records exposing confidential fields; access changes during a session; post-commit events lost on process restart; shift midnight boundaries; calculating margin versus cash flow; Supabase/network availability. Enforce quantity invariants and idempotency in transactions, use decimal SQL types, validate tenant references, and make status recomputation repeatable. Polling is sufficient initially. Never rely on regex alone as a SQL security boundary: defer generated SQL/AI.

The existing plans are specifications with illustrative snippets, not tested migrations. Examples need review before copying: frontend session/org cache isolation, setup version pinning, relationship constraints, migration ordering, stock locking, reporting cost allocation and AI access. Pin compatible dependencies and keep a lockfile. Supabase auth means the current architecture is not fully offline; test a local deployment and prepare a recorded demo, clearly distinguished from live operation. Genuine offline auth/data requires additional work.

## Architecture and stack

One React 18/Vite application, JavaScript, Router 7, TanStack Query 5, Ant Design 5 and Tailwind 4. Router/Tailwind were updated from the original plan because npm audit reported advisories in the older dependency trees. Tailwind preflight stays omitted to preserve Ant Design styling. One Node/Express API with Zod, parameterized pg queries and Supabase PostgreSQL/Auth. Keep runtime on installed Node 22 for local checks; pin the same runtime in deployment after dependency verification. Add Socket.io, QR and charts only when their screens need them. No microservices or autonomous agents.

Dependency integration references: [Tailwind PostCSS setup](https://tailwindcss.com/docs/installation/using-postcss) and [React Router changelog](https://reactrouter.com/start/start/changelog). Package-lock records the exact resolved versions.

Browser → REST `/api/v1` → auth/membership/permissions → services → transaction + PostgreSQL RLS. Supabase client is for authentication only. The UI uses live APIs by default. A failed request never becomes fabricated demo data.

## Database handoff

Use the detailed SQL in `02_BACKEND_EXECUTION.md` as the starting reference; Member A reviews and executes migrations. The following is the minimal relational scope, with UUID PKs, tenant IDs, timestamps and audit actor on operational records.

| Tables | Required columns / relationships / constraints |
|---|---|
| organizations, profiles, memberships, roles, permissions, role_permissions | Membership unique(org,user); role must belong to membership org; profile references auth user. |
| contacts, items, warehouses | Contacts have buyer/supplier type; items have kind, colour, uom, reorder_level; quantity unit explicit. |
| stages, machines, shifts, workers, assignments | Machine stage FK; assignment machine/worker/shift FK with nonoverlapping active intervals. |
| boms, bom_lines | Output item/qty, component item/qty, wastage 0≤x<100; one default BOM; detect cycles; net shared stock once. |
| orders, order_lines, order_events | Seller org and buyer org/contact; deadline, priority, derived status; lines item/qty>0/uom/rate≥0; snapshots for historical prices. |
| goods_receipts, receipt_lines, stock_lots, stock_movements, reservations | Lot unit cost and supplier; signed movement qty; receipt post idempotent; reservation order/lot/qty; lock balance on allocation. |
| work_orders, production_logs, material_issues, work_order_outputs, machine_events | Order line, stage, machine, shift/worker, input/output/waste quantities; require compatible units and bounded output. |
| rolls, roll_yarn_lots, qc_inspections, qc_defects | Unique(org,roll_no); order/work order/length/status; immutable inspections; genealogy links to lots. |
| dispatches, dispatch_rolls | Order/buyer, status and confirmation time; UNIQUE(roll_id); transactional scan/confirm; consistent cancellation semantics. |
| invoices, invoice_lines, payments, expenses | Amounts numeric(14,2); unique invoice per dispatch; payments cannot exceed balance without explicit credit workflow; totals server-calculated. |
| attendance_punches, attendance, wage_runs, wage_lines | Worker/shift/start-date; immutable punches and corrections; wage run uniqueness by period; approved snapshots. |
| audit_logs | Actor, entity, action and timestamp; never store credentials. |

Quantities numeric(14,3), costs numeric(14,4), UTC timestamptz; display Asia/Kolkata. Add indexes on tenant + common filters, FK references and status/deadline. RLS and server authorization are complementary. Shared records need separate read and write policies; restrict columns in API serializers. Migration test starts from a clean DB, not the developer's populated instance.

## API contract

The endpoint inventory is in backend plan §10. `05_FRONTEND_CONTRACT.md` freezes response fields consumed by the first UI slice. All successful responses are `{data,meta?}`; failures `{error:{code,message,details?}}`. Bearer token plus `x-org-id` on tenant requests. GET list uses page/limit/q/status. 400 validation, 401 authentication, 403 authorization, 404 missing, 409 conflict, 422 business rule, 500 safe server failure. Do not auto-retry writes. Critical writes must support idempotency keys server-side before adding retry UI.

## Exact ownership and dependencies

| Member | Branch / files | Deliverables | First handoff |
|---|---|---|---|
| A: backend/integration | feature/api-foundation; server/, db/migrations/ | Auth, tenant/RBAC, reviewed schema, me/context, contacts/items, orders/confirm, receipt/stock, transactional dispatch | H2 frozen contracts; H4 authenticated DB-backed order create/read |
| B: frontend (this workspace) | feature/frontend; client/, frontend contract | Shell/login/org switching, order list/create/detail, stock/board, API error states; subsequent QC/dispatch forms | H3 build; H4 API integration with A |
| C: operations | feature/operations; server/src/modules/production,quality,workforce + agreed client feature folders | Production, assignments, breakdowns, roll/QC, attendance; coordinate client file ownership with B first | H5 production contract; H8 roll/QC working |
| D: reporting/release | feature/release; db/seed/, server reports/finance, test/, deploy docs | Small deterministic seed, costing/wages/invoices/payment reports, integration regression, deployment and demo | H3 seed fixtures; H6 preview deployment |

A owns shared DB migration ordering; B owns package.json, router and shared UI. C/D propose changes to those files through owners. Every task names acceptance IDs, dependency, reviewer and verification command. Review by next member A→B→C→D→A; security/contract changes additionally reviewed by A. Merge small changes every 1–2 hours into demoable integration; escalate after 20 minutes blocked. Do not wait for a final mega-merge. No commits/pushes from this session without instruction.

## Hour-by-hour milestones

| Hour | Target / exit evidence |
|---|---|
| 0 | Map six scenes to R1–R10, assign owners, confirm rules. |
| 1 | Freeze minimal schema and JSON examples; remove optional dependencies. |
| 2 | API health/auth + frontend shell; migrations reviewed. |
| 3 | Seed one mill, buyer, yarn, machine, worker; preview deployed. |
| 4 | Create order through browser → DB → refresh; first integration gate. |
| 5 | Receipt → stock; material shortage displayed. |
| 6 | Confirm/reserve order with race test; production work order. |
| 7 | Log output + machine board + shift assignment. |
| 8 | Create roll and QC decision; core integration gate. |
| 9 | Rework/reject and genealogy; breakdown/resolution. |
| 10 | Scan/manual roll selection; reject wrong/duplicate roll. |
| 11 | Dispatch transaction + matching invoice. |
| 12 | Entire order-to-dispatch path survives restart. |
| 13 | Attendance + wage calculation integrated. |
| 14 | Payments, bills, expenses + order cost. |
| 15 | Owner summary and period accounting reconcile. |
| 16 | Buyer tracking, field privacy and second-tenant isolation. |
| 17 | Mandatory acceptance audit; stop optional work. |
| 18 | Concurrency, authorization, validation and regression fixes. |
| 19 | Mobile, slow network and recovery QA. |
| 20 | Feature freeze; release candidate deployed. |
| 21 | Clean setup and restart smoke on release; backup/export. |
| 22 | Timed demo rehearsal with deterministic state. |
| 23 | Verify submission artifacts/access; final rehearsal and submit before official deadline. |

Every checkpoint reports completed evidence, remaining mandatory work, blockers, integration risks, next owner tasks and scope cuts. If H4 fails, all available owners focus on authenticated persistence before new screens. If H12 fails, cut every extension and finish the core path.

## Critical path and optional work

Critical: schema/auth → items/buyers → persisted order → receipt/reservation → production → roll/QC → validated dispatch/invoice → costing/payments. Attendance/wages proceeds beside production and joins costing. Tracking consumes derived status.

Optional after core passes: complete buyer/supplier portals, transporter/driver OTP, SaaS onboarding/admin, partner invitations, sophisticated BOM editor, photo uploads, live sockets, QR camera (manual input first), PDF polish, AI/SQL chat, 90-day simulation. No GPS, blockchain, IoT, biometric recognition, real payment gateway or statutory payroll.

## Testing and deployment

Frontend: production build, unit tests for input/contracts and API failures, browser smoke for login, org switch, order create/reload, errors and 360px navigation. Backend: clean migration/seed, stock and dispatch races, tenant/role/scope negative tests, night shift and wage boundaries, invoice/cost reconciliation, rollback and idempotency. Never report integration success until run against PostgreSQL.

Deploy FE to Vercel with SPA rewrite, API to one Node host, DB/Auth to Supabase. Verify public environment values, private server keys, CORS and auth redirect URLs, health, migrations, persisted create/reload and deployment restart. Keep seed/reset restricted to explicitly identified demo DB with confirmation. Run local FE/API on demo machine and document internet dependence; retain DB export and a permitted backup recording. Release evidence records revision, commands, results and remaining limitations.
