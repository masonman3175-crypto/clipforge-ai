import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { query } from '../db/pool.js';
import { signedUrl } from '../services/storage.js';

const router = Router();

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

/** GET /api/clips/:id/download — signed URL + record an export usage event. */
router.get(
  '/:id/download',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{ render_path: string | null; caption_style: string }>(
      `SELECT render_path, caption_style FROM clips WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    const clip = rows[0];
    if (!clip) throw new ApiError(404, 'Clip not found');
    if (!clip.render_path) throw new ApiError(409, 'Clip is still rendering');

    await query(
      `INSERT INTO usage_events (user_id, kind, caption_style) VALUES ($1, 'clip_exported', $2)`,
      [req.user!.id, clip.caption_style],
    );
    const url = await signedUrl(clip.render_path, 600);
    res.json({ url });
  }),
);

export default router;
