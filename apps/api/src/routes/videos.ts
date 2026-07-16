import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { enforceVideoQuota } from '../middleware/quota.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { query } from '../db/pool.js';
import { uploadFile, signedUrl, supabaseAdmin } from '../services/storage.js';
import { env } from '../config/env.js';
import { processVideo } from '../workers/processVideo.js';

const router = Router();

/**
 * POST /api/videos/upload-init — create the video row and return a signed URL
 * for the browser to upload the file DIRECTLY to Supabase Storage. This bypasses
 * the request-size limits of the web proxy/API server, so large (1–2 hour)
 * videos can be uploaded.
 */
const initSchema = z.object({ title: z.string().min(1), ext: z.string().default('.mp4') });
router.post(
  '/upload-init',
  requireAuth,
  enforceVideoQuota,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { title, ext } = initSchema.parse(req.body);

    const { rows } = await query<{ id: string }>(
      `INSERT INTO videos (user_id, title, source, status) VALUES ($1, $2, 'upload', 'queued') RETURNING id`,
      [user.id, title],
    );
    const videoId = rows[0].id;
    const storageKey = `sources/${user.id}/${videoId}${ext.startsWith('.') ? ext : '.' + ext}`;

    const { data, error } = await supabaseAdmin.storage
      .from(env.SUPABASE_STORAGE_BUCKET)
      .createSignedUploadUrl(storageKey);
    if (error) throw new ApiError(500, `Could not create upload URL: ${error.message}`);

    await query('UPDATE videos SET storage_path = $2 WHERE id = $1', [videoId, storageKey]);
    res.json({ id: videoId, signedUrl: data.signedUrl, token: data.token, path: data.path });
  }),
);

/** POST /api/videos/:id/process — start processing after a direct upload. */
router.post(
  '/:id/process',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM videos WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows[0]) throw new ApiError(404, 'Video not found');
    void processVideo(req.params.id);
    res.status(202).json({ id: req.params.id, status: 'queued' });
  }),
);
const upload = multer({
  storage: multer.diskStorage({}),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['video/mp4', 'video/quicktime'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only MP4 and MOV files are supported'));
  },
});

/** POST /api/videos — upload an MP4/MOV file and kick off processing. */
router.post(
  '/',
  requireAuth,
  enforceVideoQuota,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const user = req.user!;
    if (!req.file) throw new ApiError(400, 'No file uploaded');

    const ext = path.extname(req.file.originalname) || '.mp4';
    const title = req.body.title?.toString().trim() || req.file.originalname;

    const { rows } = await query<{ id: string }>(
      `INSERT INTO videos (user_id, title, source, status, size_bytes)
         VALUES ($1, $2, 'upload', 'queued', $3) RETURNING id`,
      [user.id, title, req.file.size],
    );
    const videoId = rows[0].id;

    const storageKey = `sources/${user.id}/${videoId}${ext}`;
    await uploadFile(req.file.path, storageKey, req.file.mimetype);
    await query('UPDATE videos SET storage_path = $2 WHERE id = $1', [videoId, storageKey]);

    // Fire-and-forget. Swap for a job queue in production (see workers/processVideo.ts).
    void processVideo(videoId);

    res.status(202).json({ id: videoId, status: 'queued' });
  }),
);

/** POST /api/videos/youtube — import from a YouTube URL. */
const ytSchema = z.object({ url: z.string().url() });
router.post(
  '/youtube',
  requireAuth,
  enforceVideoQuota,
  asyncHandler(async (req, res) => {
    const user = req.user!;
    const { url } = ytSchema.parse(req.body);

    const { rows } = await query<{ id: string }>(
      `INSERT INTO videos (user_id, title, source, source_url, status)
         VALUES ($1, 'Processing…', 'youtube', $2, 'queued') RETURNING id`,
      [user.id, url],
    );
    const videoId = rows[0].id;
    void processVideo(videoId);

    res.status(202).json({ id: videoId, status: 'queued' });
  }),
);

/** GET /api/videos — list the current user's projects. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT v.*,
              (SELECT count(*) FROM clips c WHERE c.video_id = v.id)::int AS clip_count
         FROM videos v
        WHERE v.user_id = $1
        ORDER BY v.created_at DESC`,
      [req.user!.id],
    );
    res.json(rows);
  }),
);

/** GET /api/videos/:id — single project + its clips + a playable source URL. */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM videos WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    const video = rows[0];
    if (!video) throw new ApiError(404, 'Video not found');

    const clips = await query(
      `SELECT * FROM clips WHERE video_id = $1 ORDER BY virality_score DESC`,
      [video.id],
    );
    const sourceUrl = video.storage_path ? await signedUrl(video.storage_path) : null;

    res.json({ ...video, sourceUrl, clips: clips.rows });
  }),
);

/** GET /api/videos/:id/status — lightweight polling endpoint for the UI. */
router.get(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query<{ status: string; progress: number; error_message: string | null }>(
      `SELECT status, progress, error_message FROM videos WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user!.id],
    );
    if (!rows[0]) throw new ApiError(404, 'Video not found');
    res.json(rows[0]);
  }),
);

/** DELETE /api/videos/:id — remove a project and its clips (cascade). */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(`DELETE FROM videos WHERE id = $1 AND user_id = $2`, [
      req.params.id,
      req.user!.id,
    ]);
    if (!rowCount) throw new ApiError(404, 'Video not found');
    res.status(204).end();
  }),
);

export default router;
