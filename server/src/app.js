import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './config/env.js';
import { auth } from './middleware/auth.js';
import { tenant } from './middleware/tenant.js';
import { errorHandler, notFoundRoute } from './middleware/errorHandler.js';
import publicRoutes from './modules/public/public.routes.js';
import kioskRoutes from './modules/workforce/kiosk.routes.js';
import { kioskLimiter } from './middleware/rateLimit.js';
import meRoutes from './modules/auth/me.routes.js';
import platformRoutes from './modules/platform/platform.routes.js';
import tenantRouter from './modules/index.js';

export const app = express();
app.set('trust proxy', 1); // behind Render/Railway proxies (rate limiter needs the real IP)
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1/public', publicRoutes); // no auth (tracking link)

app.use('/api/v1/kiosk', kioskLimiter, kioskRoutes); // device-token auth, no user session

app.use('/api/v1/me', auth, meRoutes); // auth, no org yet (orgs list, create org, accept invites)
app.use('/api/v1/admin', auth, platformRoutes); // auth + platform admin check inside
app.use('/api/v1', auth, tenant, tenantRouter); // everything tenant-scoped
app.use(notFoundRoute);
app.use(errorHandler);
