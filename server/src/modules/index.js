import { Router } from 'express';
import staff from './staff/staff.routes.js';
import partners from './partners/partners.routes.js';
import catalog from './catalog/catalog.routes.js';
import inventory from './inventory/inventory.routes.js';
import procurement from './procurement/procurement.routes.js';
import orders from './orders/orders.routes.js';
import transport from './transport/transport.routes.js';
import ai from './ai/ai.routes.js';
import notifications from './notifications/notifications.routes.js';
import orgs from './orgs/orgs.routes.js';
import production from './production/production.routes.js';
import maintenance from './maintenance/maintenance.routes.js';
import quality from './quality/quality.routes.js';
import gate from './gate/gate.routes.js';
import dispatch from './dispatch/dispatch.routes.js';
import workforce from './workforce/workforce.routes.js';
import finance from './finance/finance.routes.js';
import reports from './reports/reports.routes.js';

// All tenant-scoped modules (auth + tenant middleware already applied in app.js).
// Each owner adds their router here in their PR (§22.5); Vipul merges.
const r = Router();

r.use(staff);
r.use(partners);
r.use(catalog);
r.use(inventory);
r.use(procurement);
r.use(orders);
r.use(transport);
r.use(ai);
r.use(notifications);

// factory floor (Hrishikesh)
r.use(orgs);
r.use(production);
r.use(maintenance);
r.use(quality);
r.use(gate);
r.use(dispatch);
r.use(workforce);
r.use(finance);
r.use(reports);

export default r;
