// Builds the Express app: security headers, CORS, JSON parsing, public routes, then login + staff checks in front of the API.
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './config/env.js';
import { auth } from './middleware/auth.js';
import { staff } from './middleware/staff.js';
import { errorHandler, notFoundRoute } from './middleware/errorHandler.js';
import publicRoutes from './modules/public/public.routes.js';
import meRoutes from './modules/auth/me.routes.js';
import apiRouter from './modules/index.js';
import iotRoutes from './modules/rfid/iot.routes.js';

export const app = express();
app.set('trust proxy', 1); // behind Render/Railway proxies (rate limiter needs the real IP)
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1/public', publicRoutes); // no auth (tracking link)

app.use('/api/v1/iot', iotRoutes); // physical RFID scanners: device key, no user session
app.use('/api/v1/me', auth, meRoutes); // logged in, maybe not staff yet (profile, my access, accept an invite)
app.use('/api/v1', auth, staff, apiRouter); // everything else: logged-in mill staff
app.use(notFoundRoute);
app.use(errorHandler);
