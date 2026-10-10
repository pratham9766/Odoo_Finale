import { Router } from 'express';
import staff from './staff/staff.routes.js';
import contacts from './contacts/contacts.routes.js';
import catalog from './catalog/catalog.routes.js';
import inventory from './inventory/inventory.routes.js';
import procurement from './procurement/procurement.routes.js';
import orders from './orders/orders.routes.js';
import notifications from './notifications/notifications.routes.js';
import mill from './mill/mill.routes.js';
import production from './production/production.routes.js';
import maintenance from './maintenance/maintenance.routes.js';
import quality from './quality/quality.routes.js';
import dispatch from './dispatch/dispatch.routes.js';
import workforce from './workforce/workforce.routes.js';
import finance from './finance/finance.routes.js';
import reports from './reports/reports.routes.js';

// All API modules (auth + staff middleware already applied in app.js).
const r = Router();

r.use(staff);
r.use(contacts);
r.use(catalog);
r.use(inventory);
r.use(procurement);
r.use(orders);
r.use(notifications);
r.use(mill);
r.use(production);
r.use(maintenance);
r.use(quality);
r.use(dispatch);
r.use(workforce);
r.use(finance);
r.use(reports);

export default r;
