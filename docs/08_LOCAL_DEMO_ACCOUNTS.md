# Local login and demo data

The seed creates **one login: the owner**, plus the built-in roles (Owner, Office, Supervisor, Store Keeper, QC Inspector, Operator, Employee). Other staff are invited by email.

| | |
|---|---|
| Email | `owner@everest.demo` |
| Password | `Demo@1234` |

## Setting the mill up

1. Sign in as the owner.
2. **Roles & permissions**: the built-in roles come with sensible permissions. Adjust them, or create new roles, by ticking per module what each may view, create, update and delete (plus extra actions such as confirm, approve, pay).
3. **Staff**: invite people by email and pick their role. They open the link, fill in their details (name, phone, address, city) and choose their own password.
4. Floor staff (a role that records output, inspects rolls, assigns workers or loads trucks, but does not plan or see orders) land on the tablet screens under `/floor`. An Employee (no permissions) lands on **My work**. Everyone else lands on the dashboard.
5. To show a person's attendance, output and payslips on **My work**, link their login to a worker record: **Staff → Edit → Linked worker**.

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
