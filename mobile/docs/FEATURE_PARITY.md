# Feature Parity: web app vs mobile

The mobile menu is the web sidebar, filtered by the same permissions (`src/navigation/menu.js`). After login, office staff land
on the dashboard and floor staff on their own screen, like the web's `<Home>`.

| Web screen | Mobile | Status |
| :--- | :--- | :--- |
| Login, forgot password | `(auth)/login.jsx` | Done |
| Dashboard (role-aware KPIs, alerts) | `dashboard.jsx` | Done |
| My work (pay, attendance, output, access) | `my-work.jsx` | Done |
| Orders, order detail (confirm / cancel) | `orders.jsx`, `orders/[id].jsx` | Done |
| Inventory (materials, finished rolls) | `stock.jsx` | Done (stock adjustments stay on web) |
| Goods receipts (list, detail, post / cancel) | `receipts.jsx`, `receipts/[id].jsx` | Done (new receipt stays on web) |
| Machine board (log, pause, finish, roll, breakdown) | `machine-board.jsx` | Done |
| Work orders (list, detail, actions) | `work-orders.jsx`, `work-order/[id].jsx` | Done (scheduling stays on web) |
| Quality (queue, KPIs, QR scan, inspect) | `qc-queue.jsx`, `qc/inspect.jsx` | Done (override and roll trace stay on web) |
| Dispatch (new, scan rolls, confirm, status) | `dispatch.jsx`, `dispatch/new.jsx`, `dispatch/[id].jsx` | Done |
| Attendance (today board, supervisor mark) | `attendance.jsx` | Done (register, OT approval stay on web) |
| Notifications | `notifications.jsx` + header bell | Done |
| Profile, change password | `profile.jsx` | Done |
| Buyers & suppliers, purchase orders, items, BOMs, assignments, maintenance tickets, machines, workers | not built | Web |
| Wages, finance, reports, staff, roles, settings | not built | Web |

Not built yet: offline queue, push notifications, realtime sockets (screens poll every 30 to 120 s instead).
