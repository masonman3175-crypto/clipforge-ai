import type { NextFunction, Request, Response } from 'express';
import { query } from '../db/pool.js';

/**
 * Middleware that checks if the user has either:
 *   1. A valid (redeemed, non-expired, non-revoked) license key, OR
 *   2. Remaining free trial videos
 *
 * If neither, returns 403 with a clear message telling them to enter a key.
 * Attaches `req.licenseStatus` for downstream use.
 */
export interface LicenseStatus {
  hasLicense: boolean;
  tier: string | null;
  trialRemaining: number;
  needsKey: boolean;
}

declare global {
  namespace Express {
    interface Request {
      licenseStatus?: LicenseStatus;
    }
  }
}

export async function requireLicense(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  if (user.role === 'admin') {
    req.licenseStatus = { hasLicense: true, tier: 'pro', trialRemaining: 1, needsKey: false };
    return next();
  }

  // Check for active license
  const { rows: licenses } = await query<{
    tier: string;
    expires_at: string | null;
  }>(
    `SELECT tier, expires_at FROM licenses
     WHERE redeemed_by = $1 AND status = 'redeemed'
     ORDER BY redeemed_at DESC LIMIT 1`,
    [user.id],
  );

  if (licenses[0]) {
    const lic = licenses[0];
    // Check expiration
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      // License expired — fall through to trial check
    } else {
      req.licenseStatus = { hasLicense: true, tier: lic.tier, trialRemaining: 1, needsKey: false };
      return next();
    }
  }

  // No valid license — check free trial
  const { rows: trials } = await query<{ videos_used: number; max_videos: number }>(
    `SELECT videos_used, max_videos FROM free_trials WHERE user_id = $1`,
    [user.id],
  );

  const trial = trials[0];
  const remaining = trial ? trial.max_videos - trial.videos_used : 1; // new users get 1 free

  if (remaining > 0) {
    req.licenseStatus = { hasLicense: false, tier: null, trialRemaining: remaining, needsKey: false };
    return next();
  }

  // No license and no trial remaining
  req.licenseStatus = { hasLicense: false, tier: null, trialRemaining: 0, needsKey: true };
  return res.status(403).json({
    error: 'license_required',
    message: 'You need a license key to continue. Get one from our Discord server, or try 1 free video to see if you like it.',
    needsKey: true,
    trialRemaining: 0,
  });
}

/**
 * Track free trial usage. Called after a video is successfully processed
 * for users on the free tier (no license).
 */
export async function trackFreeTrialUsage(userId: string): Promise<void> {
  await query(
    `INSERT INTO free_trials (user_id, videos_used, max_videos)
     VALUES ($1, 1, 1)
     ON CONFLICT (user_id) DO UPDATE
       SET videos_used = free_trials.videos_used + 1,
           updated_at = now()`,
    [userId],
  );
}
