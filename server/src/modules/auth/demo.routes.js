import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { env } from '../../config/env.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { AppError } from '../../utils/errors.js';
import { demoAllowed } from './demo.guard.js';

const router = Router();
const file = new URL('../../../.demo-accounts.local.json', import.meta.url);
// These accounts are provisioned solely for synthetic demo organizations.
// Never expose this password-free shortcut on a deployed/public server.
router.use((req, _res, next) => {
  if (!demoAllowed(env, req.socket.remoteAddress, req.get('origin'))) {
    return next(new AppError(404, 'NOT_FOUND', 'Demo login is not available'));
  }
  next();
});
async function accounts() {
  try { return JSON.parse(await readFile(file, 'utf8')).accounts.filter(account => account.ready); }
  catch { throw new AppError(503, 'DEMO_NOT_READY', 'Demo accounts have not been provisioned yet.'); }
}
router.get('/accounts', async (_req,res) => {
  res.set('Cache-Control','no-store');
  res.json({ data: (await accounts()).map(({id,role,type,email}) => ({id,role,type,email})) });
});
router.post('/session', authLimiter, async (req,res) => {
  const account = (await accounts()).find(row => row.id === req.body?.id);
  if (!account) throw new AppError(404,'NOT_FOUND','Choose a valid demo account');
  const auth = createClient(env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession:false,autoRefreshToken:false } });
  const {data,error} = await auth.auth.signInWithPassword({email:account.email,password:account.password});
  if (error) throw new AppError(503,'DEMO_LOGIN_FAILED','Demo sign-in failed. Try again shortly.');
  res.set('Cache-Control','no-store');
  res.json({data:{access_token:data.session.access_token,refresh_token:data.session.refresh_token}});
});
export default router;
