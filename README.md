# Sameta

Textile mill operations for one mill (Everest Textile Mills), built for the Odoo × NMIT hackathon problem statement
(`Textile_Manufacturing_System.pdf`). It replaces the mill's notebooks, paper slips and phone calls with one system.

## What it covers

| Scene in the problem statement | Where it lives |
|---|---|
| Yarn arrives at the gate | **Goods receipts** (lot, rate, the order it is for) → **Inventory**; low-stock alerts; the "Do we have enough material?" check on every order, with **Create purchase order** for shortages → **Purchase orders** |
| The production floor | **Machine board** (what every machine is doing, output today), **Work orders**, **Assignments**, **Maintenance**; tablet screens under `/floor` |
| Checking the fabric | **Quality control** (pass / rework / reject), roll traceability back to order, machine and yarn lot, roll labels |
| A buyer asks about their order | **Buyer tracking link** on each order: a public page with status, stage and expected date, no prices |
| Loading the truck | **Dispatch**: scan rolls, ordered / scanned / remaining, packing list; confirming creates the matching invoice |
| The owner closes the books | **Accounts** (invoices, payments, expenses), **Wages** (wage runs, payslips), **Reports** (cost per order, machine output, wages, QC, monthly P&L) |

Every employee also has **My work** (own attendance, output, payslips, and what their role allows) and **My profile**.

## Roles

| Role | Lands on | Can |
|---|---|---|
| Owner | Dashboard | Everything |
| Office | Dashboard | Orders with prices, buyers and suppliers, purchase orders, invoices, payments, expenses, wage runs, cost reports |
| Supervisor | Dashboard | Production planning, assignments, attendance and overtime approval, breakdowns, production / QC / attendance reports |
| Store Keeper | Dashboard | Stock, goods receipts, dispatch |
| QC Inspector | QC tablet | Inspect rolls, QC report |
| Operator | Machine tablet | Log production, machine status, report breakdowns |
| Employee | My work | Only their own attendance, output and payslips |

The owner can change any role except Owner in **Roles & permissions**. Staff join through an email invite.

## Run it locally

```powershell
# server/  (copy .env.example to .env and fill in Supabase + Postgres)
npm install
npm run migrate            # create / update the tables
npm run reset -- --yes     # empty the tables, seed Everest Textile Mills + 30 days of history
npm run dev                # API on http://localhost:4000 (REST + socket.io for live updates)

# client/  (copy .env.example to .env.local: VITE_API_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
npm install
npm run dev                # http://127.0.0.1:5173
```

Login after a reset: `owner@everest.demo` / `Demo@1234`. See [docs/08_LOCAL_DEMO_ACCOUNTS.md](docs/08_LOCAL_DEMO_ACCOUNTS.md).

For **Forgot password** to work, add `<client URL>/reset-password` to the redirect URLs in Supabase (Authentication → URL configuration).

## Tests

```powershell
cd server; npm test    # unit tests: wage rules, attendance, P&L, PDFs, plan tree, CRUD helpers
cd client; npm test    # API client, contracts, order validation
```

## Structure

- `client/`: React + Vite + Ant Design. Pages in `src/features`, live updates in `src/lib/realtime.js`.
- `server/`: Express API, one module per area in `src/modules`, events and jobs in `src/events` and `src/jobs`.
- `db/`: SQL migrations (`db/migrations`, applied in order) and the seed / simulation.
- `docs/`: planning documents. Files 01–07 are the original plans and history (written for an earlier multi-mill design); 08 is current.
