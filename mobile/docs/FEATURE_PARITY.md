# Feature parity: web app vs mobile

The mobile menu is the web sidebar, filtered by the same permissions (`src/navigation/menu.js`). After login, office staff land on the dashboard and floor staff on their own screen, like the web's `<Home>`. The phone is a **shop-floor companion**: it deliberately does not copy finance, wages, reports or administration.

| Web screen | Mobile | Status |
| :--- | :--- | :--- |
| Login, forgot password | `(auth)/login.jsx` | Done |
| Dashboard (role-aware numbers, exceptions, next jobs) | `dashboard.jsx` | Done |
| My work (pay, attendance, output, access) | `my-work.jsx` | Done (needs `GET /me/work`) |
| Orders, order detail (confirm / cancel, share buyer link) | `orders.jsx`, `orders/[id].jsx` | Done |
| Inventory (materials: on hand / reserved / free; finished rolls) | `stock.jsx` | Done (stock adjustments stay on web) |
| Goods receipts (list, detail, post / cancel) | `receipts.jsx`, `receipts/[id].jsx` | Done (**new receipt stays on web**) |
| Machine board (status, breakdown, open work order) | `machine-board.jsx` | Done |
| Work orders (list, detail; start, pause, resume, finish, **log output**, **create roll** as separate steps) | `work-orders.jsx`, `work-order/[id].jsx` | Done (scheduling stays on web) |
| Quality (queue, KPIs, scan or type a roll, inspect) | `qc-queue.jsx`, `qc/inspect.jsx` | Done (override stays on web) |
| Roll traceability (scan a label, journey) | `trace.jsx`, `roll/[rollNo].jsx` | Done |
| Dispatch (new, scan rolls, confirm, status) | `dispatch.jsx`, `dispatch/new.jsx`, `dispatch/[id].jsx` | Done |
| Attendance (today, **needs correction**, supervisor mark) | `attendance.jsx` | Done (register, OT approval stay on web) |
| RFID (cards, scanners, live scans) | not built | Web |
| Notifications | `notifications.jsx` + header bell | Done |
| Profile, change password | `profile.jsx` | Done |
| Buyers & suppliers, purchase orders, items, BOMs, assignments, maintenance tickets, machines, workers | not built | Web |
| Wages, finance, reports, staff, roles, settings | not built | Web |

Not built: an offline entry queue (retry and conflict rules have to be proven first: only production output and rolls are retry-safe today), push notifications, realtime sockets (screens poll every 30 to 120 s and refetch after each action).
