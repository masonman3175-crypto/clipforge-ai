'use client';

import { supabase, cleanToken } from './supabase';
import { IS_DEMO, demoResponse } from './demo';

/**
 * Thin fetch wrapper that attaches the Supabase access token as a Bearer token
 * on every request to our Express API. Requests go to same-origin /api/* which
 * Next rewrites to the backend (see next.config.js).
 */
async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = cleanToken(data.session?.access_token);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (IS_DEMO) {
    const data = demoResponse(path, (init.method ?? 'GET').toUpperCase());
    // Simulate a little latency so loading states are visible.
    await new Promise((r) => setTimeout(r, 200));
    if (data === undefined) throw new ApiError(404, 'demo: unhandled path');
    return data as T;
  }

  const headers = new Headers(init.headers);
  const auth = await authHeaders();
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v as string));
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || body.error || res.statusText, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
  }
}

/**
 * Upload a video by streaming it DIRECTLY to Supabase Storage (not through our
 * API/proxy), so large files aren't blocked by request-size limits:
 *   1. ask the API for a signed upload URL
 *   2. PUT the file straight to Supabase (with progress)
 *   3. tell the API to start processing
 */
export async function uploadVideo(
  file: File,
  title: string,
  onProgress: (pct: number) => void,
): Promise<{ id: string }> {
  if (IS_DEMO) {
    return new Promise((resolve) => {
      let pct = 0;
      const t = setInterval(() => {
        pct = Math.min(100, pct + 20);
        onProgress(pct);
        if (pct >= 100) {
          clearInterval(t);
          resolve({ id: 'demo-1' });
        }
      }, 250);
    });
  }

  const ext = '.' + (file.name.split('.').pop() || 'mp4');
  const init = await api<{ id: string; signedUrl: string; token: string; path: string }>(
    '/videos/upload-init',
    { method: 'POST', body: JSON.stringify({ title, ext }) },
  );

  // PUT the file straight to Supabase Storage's signed upload URL, with progress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', init.signedUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300 ? resolve() : reject(new ApiError(xhr.status, xhr.responseText || 'Upload failed'));
    xhr.onerror = () => reject(new ApiError(0, 'Upload network error'));
    xhr.send(file);
  });

  await api(`/videos/${init.id}/process`, { method: 'POST' });
  return { id: init.id };
}
