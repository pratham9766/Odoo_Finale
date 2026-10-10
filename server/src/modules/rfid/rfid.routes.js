// RFID attendance, for signed-in staff (auth + staff middleware already applied).
//   GET    /rfid/config                          rfid.view          is the simulator on, duplicate window
//   GET    /rfid/dashboard?date=                 rfid.view          live board: enrolled, present, not in, late, recent scans
//   GET    /rfid/events?from&to&status&source    rfid.view          raw scan log
//   GET    /rfid/history?from&to&source          rfid.view          attendance rows with their source and device
//   GET    /attendance/rfid?from&to&status&...   attendance.view or rfid.view   recent RFID scans (same as /rfid/events)
//   GET    /rfid/cards?q&status                  rfid.view          workers with their current card
//   POST   /rfid/workers/:workerId/card          rfid.manage        assign { card_uid }
//   PUT    /rfid/workers/:workerId/card          rfid.manage        replace { card_uid }
//   DELETE /rfid/workers/:workerId/card          rfid.manage        deactivate
//   GET    /rfid/devices                         rfid.view
//   POST   /rfid/devices                         rfid.manage        register a scanner; the key is shown once
//   POST   /rfid/devices/:id/rotate-key          rfid.manage
//   PATCH  /rfid/devices/:id                     rfid.manage        { name?, active? }
//   POST   /rfid/simulate                        rfid.simulate      { card_uid } | { worker_id }; demo / development only
//   POST   /rfid/demo/reset                      rfid.simulate + rfid.manage   deletes simulator scans and their attendance only
// The ESP32 endpoint is in iot.routes.js (device key, no user).

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as s from './rfid.schema.js';
import * as svc from './rfid.service.js';

const r = Router();
const view = can('rfid.view');
const manage = can('rfid.manage');
const simulate = can('rfid.simulate');
const worker = (req) => req.valid.params.workerId;

r.use('/rfid', requireModule('workforce'));

r.get('/rfid/config', view, (_req, res) => res.json({ data: svc.config() }));
r.get('/rfid/dashboard', view, validate({ query: s.dashboardQuery }), async (req, res) => res.json({ data: await svc.dashboard(req.ctx, req.valid.query) }));
r.get('/rfid/events', view, validate({ query: s.eventsQuery }), async (req, res) => {
  const { rows, meta } = await svc.listEvents(req.ctx, req.valid.query);
  res.json({ data: rows, meta });
});
r.get('/attendance/rfid', can('attendance.view', 'rfid.view'), validate({ query: s.eventsQuery }), async (req, res) => {
  const { rows, meta } = await svc.listEvents(req.ctx, req.valid.query);
  res.json({ data: rows, meta });
});
r.get('/rfid/history', view, validate({ query: s.historyQuery }), async (req, res) => res.json({ data: await svc.history(req.ctx, req.valid.query) }));

r.get('/rfid/cards', view, validate({ query: s.cardsQuery }), async (req, res) => res.json({ data: await svc.listCards(req.ctx, req.valid.query) }));
r.post('/rfid/workers/:workerId/card', manage, validate({ params: s.workerParams, body: s.assignSchema }),
  async (req, res) => res.status(201).json({ data: await svc.assignCard(req.ctx, worker(req), req.valid.body) }));
r.put('/rfid/workers/:workerId/card', manage, validate({ params: s.workerParams, body: s.replaceSchema }),
  async (req, res) => res.json({ data: await svc.replaceCard(req.ctx, worker(req), req.valid.body) }));
r.delete('/rfid/workers/:workerId/card', manage, validate({ params: s.workerParams }),
  async (req, res) => res.json({ data: await svc.deactivateCard(req.ctx, worker(req)) }));

r.get('/rfid/devices', view, async (_req, res) => res.json({ data: await svc.listDevices() }));
r.post('/rfid/devices', manage, validate({ body: s.deviceSchema }), async (req, res) => res.status(201).json({ data: await svc.createDevice(req.ctx, req.valid.body) }));
r.post('/rfid/devices/:id/rotate-key', manage, validate({ params: idParams }), async (req, res) => res.json({ data: await svc.rotateDeviceKey(req.ctx, req.valid.params.id) }));
r.patch('/rfid/devices/:id', manage, validate({ params: idParams, body: s.deviceUpdateSchema }),
  async (req, res) => res.json({ data: await svc.updateDevice(req.ctx, req.valid.params.id, req.valid.body) }));

r.post('/rfid/simulate', simulate, validate({ body: s.simulateSchema }), async (req, res) => res.json({ data: await svc.simulateScan(req.ctx, req.valid.body) }));
r.post('/rfid/demo/reset', simulate, manage, async (req, res) => res.json({ data: await svc.resetDemo(req.ctx) }));

export default r;
