import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

/**
 * Enforces the Free-plan monthly video limit. Pro users pass through.
 * Counts `video_processed` usage events in the current calendar month.
 */
export async function enforceVideoQuota(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  if (user.plan === 'pro') return next();

  const { rows } = await query<{ count: string }>(
    `SELECT count(*)::int AS count
       FROM usage_events
      WHERE user_id = $1
        AND kind = 'video_processed'
        AND created_at >= date_trunc('month', now())`,
    [user.id],
  );

  const used = Number(rows[0]?.count ?? 0);
  if (used >= env.FREE_PLAN_VIDEOS_PER_MONTH) {
    return res.status(402).json({
      error: 'quota_exceeded',
      message: `Free plan is limited to ${env.FREE_PLAN_VIDEOS_PER_MONTH} videos per month. Upgrade to Pro for unlimited clips.`,
      used,
      limit: env.FREE_PLAN_VIDEOS_PER_MONTH,
    });
  }
  next();
}
