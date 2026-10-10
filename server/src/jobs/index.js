import cron from 'node-cron';
import { pool } from '../db/pool.js';
import { withSystem } from '../db/withTenant.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// Registry: name -> { schedule, run(orgId, db) }.
// Each job module (owner in §22.1) calls register() from its own file; this file imports them.
const jobs = new Map();

export function register(name, schedule, run) {
  jobs.set(name, { schedule, run });
}

async function activeOrgs() {
  const { rows } = await pool.query('select list_active_orgs() as id');
  return rows.map((r) => r.id);
}

// run one job for every active org; one failing org never stops the others
export async function runJob(name) {
  await loadJobs();
  const job = jobs.get(name);
  if (!job) throw new AppError(404, 'NOT_FOUND', `Unknown job ${name}`);
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

let loading;
// idempotent: the scheduler and on-demand runs both call this
export function loadJobs() {
  loading ??= importJobFiles();
  return loading;
}

async function importJobFiles() {
  // optional job files are imported if they exist so teammates can drop them in without touching this file
  const files = ['lowStock', 'deadlineRisk', 'overduePayments', 'absentAlerts', 'missingCheckout', 'unmovedStock', 'insights'];
  for (const f of files) {
    try {
      await import(`./${f}.js`);
    } catch (err) {
      if (err.code !== 'ERR_MODULE_NOT_FOUND' || !String(err.message).includes(`${f}.js`)) throw err;
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
