import { readdir } from 'node:fs/promises';
import cron from 'node-cron';
import { pool } from '../db/pool.js';
import { withSystem } from '../db/withTenant.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// Registry of cron jobs. Two shapes are supported:
//   per-org: register(name, schedule, (orgId, db) => ...)   — runJob loops the active orgs, one transaction each
//   global:  export const x = { name, schedule, run() }     — the job loops the orgs itself (see forEachActiveOrg.js)
const jobs = new Map();

export function register(name, schedule, run) {
  jobs.set(name, { schedule, run, global: false });
}

async function activeOrgs() {
  const { rows } = await pool.query('select list_active_orgs() as id');
  return rows.map((r) => r.id);
}

export async function runJob(name) {
  await loadJobs();
  const job = jobs.get(name);
  if (!job) throw new AppError(404, 'NOT_FOUND', `Unknown job ${name}`);
  if (job.global) return { job: name, result: await job.run() };
  // per-org: one failing org never stops the others
  const orgs = await activeOrgs();
  let failed = 0;
  for (const orgId of orgs) {
    try {
      await withSystem(orgId, (db) => job.run(orgId, db));
    } catch (err) {
      failed++;
      console.error(`[job ${name}] org ${orgId}:`, err.message);
    }
  }
  return { job: name, orgs: orgs.length, failed };
}

export const jobList = () => [...jobs].map(([name, j]) => ({ name, schedule: j.schedule }));

let loading;
// idempotent: the scheduler and on-demand runs both call this
export function loadJobs() {
  loading ??= importJobFiles();
  return loading;
}

const HELPERS = new Set(['index.js', 'forEachActiveOrg.js', 'notifyOnce.js']);

// every jobs/*.js file is a job module: it either calls register() or exports { name, schedule, run }
async function importJobFiles() {
  const files = (await readdir(new URL('.', import.meta.url))).filter((f) => f.endsWith('.js') && !HELPERS.has(f));
  for (const f of files) {
    const mod = await import(`./${f}`);
    for (const value of Object.values(mod)) {
      if (value && typeof value === 'object' && typeof value.run === 'function' && value.name && value.schedule && !jobs.has(value.name)) {
        jobs.set(value.name, { schedule: value.schedule, run: value.run, global: true });
      }
    }
  }
}

export async function startJobs() {
  await loadJobs();
  if (!env.JOBS_ENABLED) return console.log('[jobs] disabled');
  for (const [name, { schedule }] of jobs) {
    cron.schedule(schedule, () => runJob(name).catch((e) => console.error(`[job ${name}]`, e)), { timezone: 'Asia/Kolkata' });
  }
  console.log(`[jobs] scheduled: ${[...jobs.keys()].join(', ') || 'none'}`);
}
