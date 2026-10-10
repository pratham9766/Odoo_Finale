// db/ has no node_modules of its own: scripts here load their npm packages from server/node_modules.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverPackage = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../server/package.json');
export const requireServer = createRequire(serverPackage);
export const serverEnvPath = path.join(path.dirname(serverPackage), '.env');

/** Load server/.env into process.env (no-op for variables already set). */
export function loadServerEnv() {
  requireServer('dotenv').config({ path: serverEnvPath, quiet: true });
}
