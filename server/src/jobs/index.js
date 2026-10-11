// Cron job registry: loads every jobs/*.js file and runs them on their schedule (or on demand with runJob).
import { readdir } from 'node:fs/promises';
import cron from 'node-cron';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

// Registry of cron jobs. Every jobs/*.js file exports { name, schedule, run } and is picked up automatically.
const jobs = new Map();

export async function runJob(name) {
  await loadJobs();
  const job = jobs.get(name);
  if (!job) throw new AppError(404, 'NOT_FOUND', `Unknown job ${name}`);
  return { job: name, result: await job.run() };
}

export const jobList = () => [...jobs].map(([name, j]) => ({ name, schedule: j.schedule }));

let loading;
// idempotent: the scheduler and on-demand runs both call this
export function loadJobs() {
  loading ??= importJobFiles();
  return loading;
}

const HELPERS = new Set(['index.js', 'notifyOnce.js']);

async function importJobFiles() {
  const files = (await readdir(new URL('.', import.meta.url))).filter((f) => f.endsWith('.js') && !HELPERS.has(f));
  for (const f of files) {
    const mod = await import(`./${f}`);
    for (const value of Object.values(mod)) {
      if (value && typeof value === 'object' && typeof value.run === 'function' && value.name && value.schedule && !jobs.has(value.name)) {
        jobs.set(value.name, { schedule: value.schedule, run: value.run });
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
