import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { query } from '../db/pool.js';

const router = Router();

/**
 * GET /api/analytics/me — per-user analytics for the dashboard Home page:
 * totals, monthly usage vs. quota, and most-used caption style.
 */
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;

    const [totals, monthly, topStyle] = await Promise.all([
      query(
        `SELECT
           (SELECT count(*) FROM videos WHERE user_id = $1 AND status = 'ready')::int AS videos_processed,
           (SELECT count(*) FROM clips  WHERE user_id = $1)::int AS clips_generated,
           (SELECT count(*) FROM usage_events WHERE user_id = $1 AND kind = 'clip_exported')::int AS clips_exported`,
        [userId],
      ),
      query(
        `SELECT count(*)::int AS videos_this_month
           FROM usage_events
          WHERE user_id = $1 AND kind = 'video_processed'
            AND created_at >= date_trunc('month', now())`,
        [userId],
      ),
      query(
        `SELECT caption_style, count(*)::int AS uses
           FROM usage_events
          WHERE user_id = $1 AND kind = 'clip_exported' AND caption_style IS NOT NULL
          GROUP BY caption_style ORDER BY uses DESC LIMIT 1`,
        [userId],
      ),
    ]);

    res.json({
      ...totals.rows[0],
      videos_this_month: monthly.rows[0]?.videos_this_month ?? 0,
      top_caption_style: topStyle.rows[0]?.caption_style ?? null,
      plan: req.user!.plan,
    });
  }),
);

export default router;
