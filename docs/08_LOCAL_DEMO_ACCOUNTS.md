# Local login and demo data

The mill has **one built-in login: the owner**. There are no predefined staff roles and no demo role switcher.

| | |
|---|---|
| Email | `owner@everest.demo` |
| Password | `Demo@1234` |

## Setting the mill up

1. Sign in as the owner.
2. **Roles & permissions**: create the roles the mill needs and tick, per module, what each may view, create, update and delete (plus the extra actions such as confirm, approve, pay).
3. **Staff**: invite people by email and pick their role. They open the link, fill in their details (name, phone, address, city) and choose their own password.
4. Floor staff (a role that records output, inspects rolls, assigns workers or loads trucks, but does not plan or see orders) land on the tablet screens under `/floor`. Everyone else lands on the dashboard.

If SMTP is not configured (`SMTP_USER` / `SMTP_PASS` in `server/.env`), no email is sent. The invite screen then shows the link to copy and send by hand, and the server prints it too.

## Commands

```powershell
# server/
npm run migrate            # create the tables
npm run reset -- --yes     # empty the tables and seed Everest Textile Mills + 30 days of history, owner only
npm run dev

# client/
npm install
npm run dev
```

The seeded history (orders, rolls, dispatches, invoices, attendance, wages) is recorded as done by the owner.
