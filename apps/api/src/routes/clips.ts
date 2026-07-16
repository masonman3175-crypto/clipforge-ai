import { Router } from 'express';
import { z } from 'zod';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { query } from '../db/pool.js';
import { rm } from 'node:fs/promises';
import { signedUrl, uploadFile, downloadTo } from '../services/storage.js';
import { renderVerticalClip } from '../services/ffmpeg.js';

const router = Router();

// Prevents two concurrent export requests from rendering the same clip twice.
const renderingClips = new Map<string, Promise<string>>();

/**
 * Render a clip on demand (if not already rendered) and return its storage key.
 * Reads the source via a signed URL with input-seeking, so it never downloads
 * the whole (possibly hours-long) source — just the clip's window.
 */
async function ensureRendered(clip: any): Promise<string> {
  if (clip.render_path) return clip.render_path;
  if (renderingClips.has(clip.id)) return renderingClips.get(clip.id)!;

  const job = (async () => {
    const source = await query<{ storage_path: string | null }>(
      'SELECT storage_path FROM videos WHERE id = $1',
      [clip.video_id],
    );
    const storagePath = source.rows[0]?.storage_path;
    if (!storagePath) throw new ApiError(409, 'Source video is no longer available to render from');

    const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-export-'));
    const localSource = path.join(workDir, `source${path.extname(storagePath) || '.mp4'}`);
    const outPath = path.join(workDir, `${clip.id}.mp4`);

    await query(`UPDATE clips SET render_status = 'rendering' WHERE id = $1`, [clip.id]);
    try {
      // Bundled ffmpeg can't read remote URLs, so stream the source to disk first.
      await downloadTo(storagePath, localSource);
      await renderVerticalClip({
        sourcePath: localSource,
        outPath,
        startSec: Number(clip.start_sec),
        endSec: Number(clip.end_sec),
        captions: clip.captions ?? [],
        style: clip.caption_style,
      });

      const key = `renders/${clip.user_id}/${clip.video_id}/${clip.id}.mp4`;
      await uploadFile(outPath, key, 'video/mp4');
      await query(`UPDATE clips SET render_path = $2, render_status = 'ready' WHERE id = $1`, [clip.id, key]);
      return key;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  })().finally(() => renderingClips.delete(clip.id));

  renderingClips.set(clip.id, job);
  return job;
}

/** GET /api/clips — all clips for the current user (Generated Clips page). */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT c.*, v.title AS video_title
         FROM clips c JOIN videos v ON v.id = c.video_id
        WHERE c.user_id = $1
        ORDER BY c.created_at DESC`,
      [req.user!.id],
    );
    res.json(rows);
  }),
);

/** GET /api/clips/:id — one clip with a signed preview URL. */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT * FROM clips WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user!.id,
    ]);
    const clip = rows[0];
    if (!clip) throw new ApiError(404, 'Clip not found');
    const previewUrl = clip.render_path ? await signedUrl(clip.render_path) : null;
    res.json({ ...clip, previewUrl });
  }),
);

/** PATCH /api/clips/:id — edit title, caption text/style, or trim in/out points. */
const patchSchema = z.object({
  title: z.string().optional(),
  caption_style: z.string().optional(),
  captions: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional(),
  start_sec: z.number().nonnegative().optional(),
  end_sec: z.number().positive().optional(),
});
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = patchSchema.parse(req.body);
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, val] of Object.entries(body)) {
      if (val === undefined) continue;
      fields.push(`${key} = $${i}`);
      values.push(key === 'captions' ? JSON.stringify(val) : val);
      i++;
    }
    if (!fields.length) throw new ApiError(400, 'No fields to update');
    values.push(req.params.id, req.user!.id);

    const { rows } = await query(
      `UPDATE clips SET ${fields.join(', ')} WHERE id = $${i} AND user_id = $${i + 1} RETURNING *`,
      values,
    );
    if (!rows[0]) throw new ApiError(404, 'Clip not found');
    res.json(rows[0]);
  }),
);

/**
 * GET /api/clips/:id/download — render the clip on demand (if needed), then
 * return a signed URL and record an export usage event. May take ~10–30s the
 * first time a given clip is exported; instant afterwards (cached render).
 */
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM clips WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    const clip = rows[0];
    if (!clip) throw new ApiError(404, 'Clip not found');

    const renderPath = await ensureRendered(clip);

    await query(
      `INSERT INTO usage_events (user_id, kind, caption_style) VALUES ($1, 'clip_exported', $2)`,
      [req.user!.id, clip.caption_style],
    );
    const url = await signedUrl(renderPath, 600);
    res.json({ url });
  }),
);

export default router;
