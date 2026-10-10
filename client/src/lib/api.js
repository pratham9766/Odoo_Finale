import axios from 'axios';
import { supabase } from './supabase';

// ─── Main API client ──────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/v1`,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  // Attach JWT
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Error class ──────────────────────────────────────────────────────────
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

api.interceptors.response.use(
  (res) => res.data, // unwrap { data, meta } envelope
  async (err) => {
    if (err.code === 'ERR_CANCELED') return Promise.reject(err);
    const status = err.response?.status ?? 0;
    const e = err.response?.data?.error ?? {};
    if (status === 401) {
      await supabase.auth.signOut().catch(() => {});
    }
    return Promise.reject(
      new ApiError(status, e.code ?? 'NETWORK', e.message ?? 'Network error', e.details)
    );
  }
);

// ─── File download helper ─────────────────────────────────────────────────
export async function download(path, filename) {
  try {
    const response = await api.get(path, { responseType: 'blob' });
    const blob = response instanceof Blob ? response : new Blob([response]);
    if (blob.type?.includes('application/json')) {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      if (parsed.error) throw new ApiError(400, parsed.error.code, parsed.error.message);
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(0, 'DOWNLOAD_FAILED', 'Could not download file');
  }
}
