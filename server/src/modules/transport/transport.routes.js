import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { otpLimiter } from '../../middleware/rateLimit.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './transport.service.js';
import { vehicleSchema, vehicleUpdateSchema, driverSchema, driverUpdateSchema, tripQuery, assignSchema, rejectSchema,
  driverStatusSchema, deliverSchema, freightSchema } from './transport.schema.js';

const r = Router();
const manage = can('transport.manage');

// fleet
r.get('/transport/vehicles', manage, send((req) => s.listVehicles(req.ctx)));
r.post('/transport/vehicles', manage, validate({ body: vehicleSchema }), send((req) => s.createVehicle(req.ctx, req.valid.body), 201));
r.put('/transport/vehicles/:id', manage, validate({ params: idParam, body: vehicleUpdateSchema }), send((req) => s.updateVehicle(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/transport/vehicles/:id', manage, validate({ params: idParam }), send((req) => s.deleteVehicle(req.ctx, req.valid.params.id)));
r.get('/transport/drivers', manage, send((req) => s.listDrivers(req.ctx)));
r.post('/transport/drivers', manage, validate({ body: driverSchema }), send((req) => s.createDriver(req.ctx, req.valid.body), 201));
r.put('/transport/drivers/:id', manage, validate({ params: idParam, body: driverUpdateSchema }), send((req) => s.updateDriver(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/transport/drivers/:id', manage, validate({ params: idParam }), send((req) => s.deleteDriver(req.ctx, req.valid.params.id)));

// transporter back office
r.get('/transport/trips', manage, validate({ query: tripQuery }), send((req) => s.listTrips(req.ctx, req.valid.query)));
r.get('/transport/trips/:id', manage, validate({ params: idParam }), send((req) => s.getTrip(req.ctx, req.valid.params.id)));
r.post('/transport/trips/:id/accept', manage, validate({ params: idParam }), send((req) => s.acceptTrip(req.ctx, req.valid.params.id)));
r.post('/transport/trips/:id/reject', manage, validate({ params: idParam, body: rejectSchema }), send((req) => s.rejectTrip(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/transport/trips/:id/assign', manage, validate({ params: idParam, body: assignSchema }), send((req) => s.assignTrip(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/transport/trips/:id/freight-invoice', manage, validate({ params: idParam, body: freightSchema }), send((req) => s.freightInvoice(req.ctx, req.valid.params.id, req.valid.body), 201));

// any party (sender, receiver, transporter) follows a trip; RLS decides what exists for them
r.get('/trips', can('dispatch.view', 'transport.manage'), validate({ query: tripQuery }), send((req) => s.listTrips(req.ctx, req.valid.query, { asTransporter: false })));
r.get('/trips/:id', can('dispatch.view', 'transport.manage'), validate({ params: idParam }), send((req) => s.getTrip(req.ctx, req.valid.params.id)));

// driver app
r.get('/driver/trips', can('trip.drive'), send((req) => s.driverTrips(req.ctx)));
r.post('/driver/trips/:id/status', can('trip.drive'), validate({ params: idParam, body: driverStatusSchema }), send((req) => s.driverStatus(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/driver/trips/:id/deliver', can('trip.drive'), otpLimiter, validate({ params: idParam, body: deliverSchema }), send((req) => s.deliver(req.ctx, req.valid.params.id, req.valid.body)));

export default r;
