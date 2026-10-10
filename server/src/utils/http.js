// Route helpers. Express 5 forwards rejected promises to the error handler.
//   r.get('/', can('x'), send((req) => svc.list(req.ctx, req.valid.query)));
//   r.post('/', ..., send((req) => svc.create(req.ctx, req.valid.body), 201));
// A service may return { data, meta } to include pagination meta.
export const send = (fn, status = 200) => async (req, res) => {
  const out = await fn(req);
  if (out && typeof out === 'object' && 'data' in out && 'meta' in out) return res.status(status).json(out);
  res.status(status).json({ data: out });
};

export const sendBuffer = (fn, contentType = 'application/pdf', filename) => async (req, res) => {
  const buf = await fn(req);
  res.setHeader('Content-Type', contentType);
  if (filename) res.setHeader('Content-Disposition', `inline; filename="${filename(req)}"`);
  res.send(buf);
};
