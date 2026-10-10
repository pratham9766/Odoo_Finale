// Express glue for a createCrud() service: one set of handlers, one function that mounts the five routes.
//
//   const handlers = crudHandlers(machines);
//   mountCrud(router, '/', { handlers, schemas: { list, create, update }, read: [can(...)], write: [can(...)] });
//
// Express 5 forwards rejected promises to the error handler, so handlers have no try/catch.
// Validated input is in req.valid (validate() middleware, backend plan §22.6).

import { validate } from '../../middleware/validate.js';
import { idParams } from './schema.js';

export function crudHandlers(service) {
  return {
    list: async (req, res) => {
      const query = req.valid?.query;
      const { rows, total } = await service.list(req.ctx, query);
      res.json(query?.limit
        ? { data: rows, meta: { page: query.page, limit: query.limit, total } }
        : { data: rows });
    },
    get: async (req, res) => res.json({ data: await service.get(req.ctx, req.valid.params.id) }),
    create: async (req, res) => res.status(201).json({ data: await service.create(req.ctx, req.valid.body) }),
    update: async (req, res) =>
      res.json({ data: await service.update(req.ctx, req.valid.params.id, req.valid.body) }),
    remove: async (req, res) => res.json({ data: await service.remove(req.ctx, req.valid.params.id) }),
  };
}

/**
 * GET / · GET /:id · POST / · PATCH /:id · DELETE /:id under `path`.
 * @param {{ handlers: object, schemas?: { list?, create?, update? }, read?: Function[], write?: Function[],
 *           create?: Function[], update?: Function[], remove?: Function[],
 *           only?: Array<'list'|'get'|'create'|'update'|'remove'> }} opts
 *        read / write are middleware lists (permission checks) put in front of the read / write routes;
 *        create / update / remove replace `write` for just that action (view / create / update / delete permissions);
 *        `only` mounts just some of the five (work orders have no create or delete here).
 */
export function mountCrud(router, path, { handlers, schemas = {}, read = [], write = [], create = write, update = write, remove = write, only }) {
  const item = `${path.replace(/\/$/, '')}/:id`;
  const routes = {
    list: ['get', path, read, { query: schemas.list }],
    get: ['get', item, read, { params: idParams }],
    create: ['post', path, create, { body: schemas.create }],
    update: ['patch', item, update, { params: idParams, body: schemas.update }],
    remove: ['delete', item, remove, { params: idParams }],
  };
  for (const [action, [method, route, guards, schema]] of Object.entries(routes)) {
    if (!only || only.includes(action)) router[method](route, ...guards, validate(schema), handlers[action]);
  }
}
