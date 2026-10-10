import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

export const BUCKETS = ['qc-photos', 'pod-photos', 'documents', 'worker-photos'];

let client;
// service-role client: storage + auth admin only, never exposed to the browser
export function supabaseAdmin() {
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const safeName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);

// every object path starts with org_id/
export const objectPath = (orgId, filename) => `${orgId}/${randomUUID()}-${safeName(filename)}`;

export function assertOrgPath(orgId, path) {
  if (!path || !path.startsWith(`${orgId}/`) || path.includes('..')) {
    throw new AppError(403, 'FORBIDDEN', 'File does not belong to this organization');
  }
}

export async function signUpload(orgId, bucket, filename) {
  if (!BUCKETS.includes(bucket)) throw new AppError(422, 'VALIDATION_FAILED', 'Unknown bucket');
  const path = objectPath(orgId, filename);
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUploadUrl(path);
  if (error) throw new AppError(502, 'STORAGE_ERROR', error.message);
  return { bucket, path, signed_url: data.signedUrl, token: data.token };
}

export async function signDownload(orgId, bucket, path, expiresIn = 300) {
  assertOrgPath(orgId, path);
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw new AppError(502, 'STORAGE_ERROR', error.message);
  return data.signedUrl;
}

// server-side upload (generated PDFs)
export async function putObject(bucket, path, buffer, contentType = 'application/pdf') {
  const { error } = await supabaseAdmin().storage.from(bucket).upload(path, buffer, { contentType, upsert: true });
  if (error) throw new AppError(502, 'STORAGE_ERROR', error.message);
  return path;
}
