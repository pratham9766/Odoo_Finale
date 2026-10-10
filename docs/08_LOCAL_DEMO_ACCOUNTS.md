# Local demo accounts

The local login screen includes **Explore a demo role**. Choose a role and click
**Enter demo workspace**. Sign out to choose another role. No password entry is needed
for this development-only shortcut; the server authenticates a real Supabase account.

## Accounts

There are 26 accounts in four new, isolated organizations:

- Manufacturer (15): Owner, General Manager, Accountant, Production Manager,
  Shift Supervisor, QC Head, Purchase Officer, Sales Coordinator, HR Clerk,
  Store Keeper, Dispatch In-charge, QC Inspector, Maintenance Technician,
  Machine Operator, Gate Security.
- Buyer (4): Owner, Purchase Manager, Store / Receiving, Accounts.
- Supplier (3): Owner, Sales / Dispatch, Accounts.
- Transporter (4): Owner, Fleet Manager, Driver, Accounts.

All accounts retain their actual backend role permissions. No platform administrator
account is created. Manufacturer orders, stock and production views are connected;
roles without a supported screen land on a workspace overview. This is not a claim
that every role-specific business workflow is implemented. New organizations have
default setup data but no seeded orders or stock transactions.

## Configuration and provisioning

Use the examples for configuration. In `server/.env`, set `NODE_ENV=development`,
`DEMO_LOGIN_ENABLED=true`, the public `SUPABASE_PUBLISHABLE_KEY`, and the normal
server/database credentials. In `client/.env.local`, set
`VITE_ENABLE_DEMO_SWITCHER=true` alongside the public frontend configuration.
Restart the API and Vite after changing environment files.

From `server`, run `node scripts/provision-demo.js` to create/resume the isolated
demo namespace. It writes random credentials to the Git-ignored
`server/.demo-accounts.local.json`. Keep this file private and local. Do not delete
it and re-provision casually: that would create another set of accounts rather
than reusing these. It never resets existing user passwords.

From `server`, `node scripts/verify-demo.js` checks the 26 logins, tenant contexts,
roles, manufacturer read endpoints, and rejected missing/untrusted origins. It
does not change business records. Login attempts are rate-limited; do not run
repeatedly within the 15-minute window.

## Security and deployment

- Demo endpoints require development mode, explicit opt-in, a loopback socket,
  and the exact configured frontend Origin. Production builds hide the selector.
- Origin is a browser boundary, not authentication against local processes.
  Never expose this development API through a public tunnel or reverse proxy.
- Do not put demo passwords, service-role keys or database credentials in Vite
  variables, source files, screenshots, or commits. Rotate the private credentials
  previously shared in chat before deployment.
- The inherited database pool disables certificate verification. Strict TLS
  diagnostics currently fail on the certificate chain; configure a trusted CA
  and verified TLS before production. This integration did not weaken that setting.
- Organization creation now supports both generated and ordinary
  `shifts.crosses_midnight` columns, without changing the shared database schema.

## Local verification

Frontend unit tests and production build pass (existing bundle-size warning).
Backend lint, demo-access guard tests and SQL guard tests pass. The shared-database
test suite is deliberately not run because it creates/deletes fixtures.
