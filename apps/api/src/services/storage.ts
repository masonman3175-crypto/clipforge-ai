import { createClient } from '@supabase/supabase-js';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { env } from '../config/env.js';

/**
 * Server-side Supabase client using the service-role key.
 * NEVER expose this client or key to the browser — it bypasses RLS.
 */
// Strip stray non-printable/non-ASCII characters that can sneak into env values
// pasted into hosting dashboards and silently break auth headers.
const clean = (s: string) => (s || '').replace(/[^\x21-\x7E]/g, '');

export const supabaseAdmin = createClient(clean(env.SUPABASE_URL), clean(env.SUPABASE_SERVICE_ROLE_KEY), {
  auth: { persistSession: false },
});

const BUCKET = env.SUPABASE_STORAGE_BUCKET;

/** Upload a local file to Supabase Storage, returning its storage key. */
export async function uploadFile(localPath: string, storageKey: string, contentType: string) {
  const buffer = await readFile(localPath);
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(storageKey, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return storageKey;
}

/** Time-limited signed URL for previewing/downloading private media. */
export async function signedUrl(storageKey: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(storageKey, expiresInSec);
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

/** Download a stored object to a local path (used by the render worker). */
/**
 * Stream a stored object to a local path via a signed URL. Streaming (rather
 * than buffering the whole file in memory) keeps memory flat, so large
 * multi-hundred-MB / GB videos download without OOM on small instances.
 */
export async function downloadTo(storageKey: string, localPath: string) {
  const url = await signedUrl(storageKey, 3600);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Storage download failed: HTTP ${res.status}`);

  const { createWriteStream } = await import('node:fs');
  const { pipeline } = await import('node:stream/promises');
  const { Readable } = await import('node:stream');
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(localPath));
  return localPath;
}

export { createReadStream };
