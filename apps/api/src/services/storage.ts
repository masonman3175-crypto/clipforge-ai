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
export async function downloadTo(storageKey: string, localPath: string) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storageKey);
  if (error) throw new Error(`Storage download failed: ${error.message}`);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(localPath, Buffer.from(await data.arrayBuffer()));
  return localPath;
}

export { createReadStream };
