import { Router } from 'express';
import { z } from 'zod';
import { can } from '../../middleware/rbac.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './ai.service.js';

const r = Router();
const chatBody = z.object({ chat_id: z.string().uuid().optional(), question: z.string().trim().min(3).max(500) });

r.post('/ai/chat', can('ai.chat', 'ai.chat_finance'), aiLimiter, validate({ body: chatBody }), send((req) => s.chat(req.ctx, req.valid.body)));
r.get('/ai/chats', can('ai.chat', 'ai.chat_finance'), send((req) => s.listChats(req.ctx)));
r.get('/ai/chats/:id', can('ai.chat', 'ai.chat_finance'), validate({ params: idParam }), send((req) => s.getChat(req.ctx, req.valid.params.id)));

// insights are visible to every member; each row is filtered by its required_permission
r.get('/ai/insights', send((req) => s.listInsights(req.ctx)));
r.post('/ai/insights/:id/dismiss', validate({ params: idParam }), send((req) => s.dismissInsight(req.ctx, req.valid.params.id)));

export default r;
