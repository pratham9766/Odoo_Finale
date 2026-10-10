import http from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './realtime/socket.js';
import { registerListeners } from './events/listeners/index.js';
import { startJobs } from './jobs/index.js';

const server = http.createServer(app);
initSocket(server);
await registerListeners();
await startJobs();
server.listen(env.PORT, () => console.log(`API on :${env.PORT}`));

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
