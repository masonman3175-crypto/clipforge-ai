import { createClient } from '@supabase/supabase-js';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const clean = (s: string) => (s || '').replace(/[^\x21-\x7E]/g, '');

/**
 * Supabase client — kept for AUTH (token validation) regardless of which storage
 * backend is active. NEVER expose this or the service-role key to the browser.
 */
export const supabaseAdmin = createClient(clean(env.SUPABASE_URL), clean(env.SUPABASE_SERVICE_ROLE_KEY), {
  auth: { persistSession: false },
});

// ── Storage backend: Cloudflare R2 (no 50MB cap) when configured, else Supabase.
const useR2 = !!(
  env.R2_ACCOUNT_ID &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
);

export const storageBackend = useR2 ? 'r2' : 'supabase';

const r2 = useR2
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
      },
    })
  : null;

const SUPA_BUCKET = env.SUPABASE_STORAGE_BUCKET;
const R2_BUCKET = env.R2_BUCKET as string;

/** Presigned URL the browser PUTs the file directly to (bypasses our server). */
export async function createUploadUrl(
  key: string,
  contentType: string,
): Promise<{ signedUrl: string; path: string }> {
  if (r2) {
    const signedUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 3600 },
    );
    return { signedUrl, path: key };
  }
  const { data, error } = await supabaseAdmin.storage.from(SUPA_BUCKET).createSignedUploadUrl(key);
  if (error) throw new Error(`Upload URL failed: ${error.message}`);
  return { signedUrl: data.signedUrl, path: data.path };
}

/** Upload a local file (used for rendered clips). */
export async function uploadFile(localPath: string, key: string, contentType: string) {
  if (r2) {
    await r2.send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: await readFile(localPath), ContentType: contentType }),
    );
    return key;
  }
  const { error } = await supabaseAdmin.storage
    .from(SUPA_BUCKET)
    .upload(key, await readFile(localPath), { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return key;
}

/** Time-limited signed URL for previewing/downloading private media. */
export async function signedUrl(key: string, expiresInSec = 3600): Promise<string> {
  if (r2) {
    return getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: expiresInSec });
  }
  const { data, error } = await supabaseAdmin.storage.from(SUPA_BUCKET).createSignedUrl(key, expiresInSec);
  if (error) throw new Error(`Signed URL failed: ${error.message}`);
  return data.signedUrl;
}

/**
 * Stream a stored object to a local path. Streaming (rather than buffering the
 * whole file in memory) keeps memory flat, so large GB videos download safely.
 */
export async function downloadTo(key: string, localPath: string) {
  if (r2) {
    const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    await pipeline(res.Body as Readable, createWriteStream(localPath));
    return localPath;
  }
  const url = await signedUrl(key, 3600);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Storage download failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(localPath));
  return localPath;
}

export { createReadStream };
