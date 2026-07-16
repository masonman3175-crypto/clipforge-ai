'use client';

import { supabase } from './supabase';
import { IS_DEMO, demoResponse } from './demo';

/**
 * Thin fetch wrapper that attaches the Supabase access token as a Bearer token
 * on every request to our Express API. Requests go to same-origin /api/* which
 * Next rewrites to the backend (see next.config.js).
 */
async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
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

/** Upload a file with progress via XHR (fetch has no upload-progress events). */
export function uploadVideo(
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
  return new Promise(async (resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);

    const { data } = await supabase.auth.getSession();
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos');
    xhr.setRequestHeader('Authorization', `Bearer ${data.session?.access_token ?? ''}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status < 300
        ? resolve(JSON.parse(xhr.responseText))
        : reject(new ApiError(xhr.status, xhr.responseText));
    xhr.onerror = () => reject(new ApiError(0, 'Network error'));
    xhr.send(form);
  });
}
