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

export default r;
