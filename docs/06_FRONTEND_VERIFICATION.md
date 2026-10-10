# Frontend verification — 2026-10-10

Scope: Member B's first frontend slice. Backend is pending, confirmed by the user.

| Check | Observed result |
|---|---|
| npm install | Completed; package-lock.json created. |
| Dependency audit after Router/Tailwind upgrade | 0 vulnerabilities reported by npm. |
| npm test | 5 tests passed: valid/invalid quantities, tenant/auth headers and write serialization, HTTP conflict propagation, malformed response rejection. |
| npm run build | Passed (Vite 6.4.4, 1544 modules). Initial sandbox attempt failed with EPERM; rerun with filesystem access succeeded. |
| Local server | Running at http://127.0.0.1:5173. |
| Browser smoke | Correct page title and setup instructions rendered with missing credentials. |

Non-blocking build warning: main bundle approximately 688 kB minified / 225 kB gzip. Feature pages are lazy-loaded; further library splitting and device/network testing remain.

Not yet verified: actual sign-in, authenticated layouts in a browser, 360px interaction, organization switch during in-flight requests, API shape compatibility, create/confirm/reload persistence, database authorization, cross-session polling, deployment. Do not interpret the unit tests or build as proof of these workflows.

## Backend integration gate

1. Backend owner confirms `05_FRONTEND_CONTRACT.md`, especially buyer/item display fields, pagination and context permissions.
2. Set public Supabase URL/anon key and API base URL in client/.env.local.
3. Seed a manufacturer, role with required permissions, user membership, buyer contact and catalog item.
4. Sign in, create draft with two lines, reload, confirm, verify DB reservation/status and refreshed stock.
5. Repeat with insufficient permissions, another tenant and failed network; verify no unauthorized data or duplicate writes.
6. Exercise desktop and 360px workflows and record evidence here before declaring integration complete.
