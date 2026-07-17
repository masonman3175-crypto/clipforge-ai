import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { query, withTransaction } from '../db/pool.js';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Generate a human-readable license key like CLIP-A1B2-C3D4 */
function generateKey(): string {
  const seg = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `CLIP-${seg()}-${seg()}`;
}

/** Simple device fingerprint hash from a raw string (browser fingerprint, etc.) */
function hashFingerprint(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// ─── POST /api/licenses/redeem ────────────────────────────────────────────────
// Existing endpoint: user enters a key, it gets tied to their account + device.

const redeemSchema = z.object({
  code: z.string().min(4),
  deviceFingerprint: z.string().optional(),
});
router.post(
  '/redeem',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code, deviceFingerprint } = redeemSchema.parse(req.body);
    const normalized = code.trim().toUpperCase();
    const fp = deviceFingerprint ? hashFingerprint(deviceFingerprint) : null;

    await withTransaction(async (c) => {
      const { rows } = await c.query<{
        id: string;
        status: string;
        tier: string;
        max_devices: number;
        device_fingerprints: string[];
        expires_at: string | null;
      }>(
        `SELECT id, status, tier, max_devices, device_fingerprints, expires_at
         FROM licenses WHERE code = $1 FOR UPDATE`,
        [normalized],
      );
      const lic = rows[0];
      if (!lic) throw new ApiError(404, 'Invalid license code');
      if (lic.status === 'revoked') throw new ApiError(403, 'This code has been revoked');
      if (lic.status === 'redeemed') {
        // Check if this user already owns it (re-entering their own key)
        const ownership = await c.query<{ id: string }>(
          `SELECT id FROM licenses WHERE id = $1 AND redeemed_by = $2`,
          [lic.id, req.user!.id],
        );
        if (!ownership.rows[0]) {
          // Someone else trying to use an already-redeemed key
          throw new ApiError(409, 'This code has already been used by another account');
        }
        // Same user re-entering — just confirm their plan
        res.json({ ok: true, plan: lic.tier, message: 'Key already active on your account' });
        return;
      }
      if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
        throw new ApiError(403, 'This code has expired');
      }

      // Check device limit
      const devices: string[] = lic.device_fingerprints || [];
      if (fp && devices.length >= lic.max_devices && !devices.includes(fp)) {
        throw new ApiError(
          403,
          `This key is already linked to ${lic.max_devices} device(s). Each key can only be used on ${lic.max_devices} device(s).`,
        );
      }

      // Register device
      const newDevices = fp ? [...new Set([...devices, fp])] : devices;

      await c.query(
        `UPDATE licenses
         SET status = 'redeemed', redeemed_by = $2, redeemed_at = now(),
             device_fingerprints = $3, last_validated_at = now()
         WHERE id = $1`,
        [lic.id, req.user!.id, JSON.stringify(newDevices)],
      );
      await c.query(`UPDATE users SET plan = $2 WHERE id = $1`, [req.user!.id, lic.tier]);

      // Log validation
      await c.query(
        `INSERT INTO license_validations (license_id, user_id, device_fingerprint, ip_address, success)
         VALUES ($1, $2, $3, $4, true)`,
        [lic.id, req.user!.id, fp, req.ip],
      );

      res.json({ ok: true, plan: lic.tier });
    });
  }),
);

// ─── POST /api/licenses/validate ──────────────────────────────────────────────
// Lightweight check: is the current user's license still valid? Called on page load.

const validateSchema = z.object({ deviceFingerprint: z.string().optional() });
router.post(
  '/validate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { deviceFingerprint } = validateSchema.parse(req.body);
    const fp = deviceFingerprint ? hashFingerprint(deviceFingerprint) : null;

    // Find the user's redeemed license
    const { rows } = await query<{
      id: string;
      tier: string;
      status: string;
      expires_at: string | null;
      device_fingerprints: string[];
      max_devices: number;
    }>(
      `SELECT id, tier, status, expires_at, device_fingerprints, max_devices
       FROM licenses WHERE redeemed_by = $1 AND status = 'redeemed'
       ORDER BY redeemed_at DESC LIMIT 1`,
      [req.user!.id],
    );

    if (!rows[0]) {
      // No license — check free trial
      const trial = await query<{ videos_used: number; max_videos: number }>(
        `SELECT videos_used, max_videos FROM free_trials WHERE user_id = $1`,
        [req.user!.id],
      );
      const t = trial.rows[0];
      const trialRemaining = t ? t.max_videos - t.videos_used : 1;
      return res.json({
        valid: false,
        tier: null,
        trialRemaining: Math.max(0, trialRemaining),
        hasTrial: !!t || true, // new users always get 1 free
        needsKey: trialRemaining <= 0,
      });
    }

    const lic = rows[0];

    // Check expiration
    if (lic.expires_at && new Date(lic.expires_at) < new Date()) {
      return res.json({ valid: false, tier: null, reason: 'expired', needsKey: true });
    }

    // Check device match
    const devices: string[] = lic.device_fingerprints || [];
    if (fp && !devices.includes(fp) && devices.length >= lic.max_devices) {
      // Log the failed attempt
      await query(
        `INSERT INTO license_validations (license_id, user_id, device_fingerprint, ip_address, success)
         VALUES ($1, $2, $3, $4, false)`,
        [lic.id, req.user!.id, fp, req.ip],
      );
      return res.json({
        valid: false,
        tier: null,
        reason: 'device_mismatch',
        needsKey: true,
        message: 'This key is registered to a different device',
      });
    }

    // Update last validated timestamp
    await query(`UPDATE licenses SET last_validated_at = now() WHERE id = $1`, [lic.id]);

    res.json({
      valid: true,
      tier: lic.tier,
      expiresAt: lic.expires_at,
      devicesUsed: devices.length,
      maxDevices: lic.max_devices,
    });
  }),
);

// ─── GET /api/licenses/me ─────────────────────────────────────────────────────
// Returns the user's current license info + free trial status.

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: licenses } = await query(
      `SELECT tier, status, redeemed_at, expires_at, last_validated_at
       FROM licenses WHERE redeemed_by = $1
       ORDER BY redeemed_at DESC`,
      [req.user!.id],
    );

    const { rows: trials } = await query<{ videos_used: number; max_videos: number }>(
      `SELECT videos_used, max_videos FROM free_trials WHERE user_id = $1`,
      [req.user!.id],
    );

    const trial = trials[0];
    res.json({
      licenses,
      trial: trial || { videos_used: 0, max_videos: 1 },
      plan: req.user!.plan,
    });
  }),
);

// ─── POST /api/licenses/generate ──────────────────────────────────────────────
// Admin-only: create a new license key. This is what the Discord bot calls.

const generateSchema = z.object({
  tier: z.enum(['free', 'pro']).default('pro'),
  count: z.number().min(1).max(50).default(1),
  maxDevices: z.number().min(1).max(10).default(1),
  expiresInDays: z.number().min(1).max(3650).optional(),
  notes: z.string().max(500).optional(),
  createdBy: z.string().optional(),
});
router.post(
  '/generate',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { tier, count, maxDevices, expiresInDays, notes, createdBy } = generateSchema.parse(req.body);

    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = generateKey();
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null;
      await query(
        `INSERT INTO licenses (code, tier, max_devices, expires_at, created_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [code, tier, maxDevices, expiresAt, createdBy ?? null, notes ?? null],
      );
      keys.push(code);
    }

    res.json({
      ok: true,
      count: keys.length,
      keys,
      tier,
      maxDevices,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
        : null,
    });
  }),
);

// ─── POST /api/licenses/deactivate ────────────────────────────────────────────
// Admin-only: revoke a license key.

const deactivateSchema = z.object({ code: z.string().min(4) });
router.post(
  '/deactivate',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { code } = deactivateSchema.parse(req.body);
    const normalized = code.trim().toUpperCase();

    const { rowCount } = await query(
      `UPDATE licenses SET status = 'revoked' WHERE code = $1 AND status != 'revoked'`,
      [normalized],
    );
    if (!rowCount) throw new ApiError(404, 'Key not found or already revoked');

    // Also downgrade the user who had it
    const { rows } = await query<{ redeemed_by: string | null }>(
      `SELECT redeemed_by FROM licenses WHERE code = $1`,
      [normalized],
    );
    if (rows[0]?.redeemed_by) {
      await query(`UPDATE users SET plan = 'free' WHERE id = $1`, [rows[0].redeemed_by]);
    }

    res.json({ ok: true, message: 'Key revoked' });
  }),
);

// ─── GET /api/licenses/admin ──────────────────────────────────────────────────
// Admin-only: list all keys with full details.

router.get(
  '/admin',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT l.code, l.tier, l.status, l.max_devices, l.device_fingerprints,
              l.expires_at, l.created_by, l.notes, l.redeemed_at, l.last_validated_at,
              u.email AS redeemed_by_email,
              (SELECT count(*) FROM license_validations lv WHERE lv.license_id = l.id)::int AS validation_count
       FROM licenses l
       LEFT JOIN users u ON u.id = l.redeemed_by
       ORDER BY l.created_at DESC`,
    );

    const stats = {
      total: rows.length,
      unused: rows.filter((r: any) => r.status === 'unused').length,
      redeemed: rows.filter((r: any) => r.status === 'redeemed').length,
      revoked: rows.filter((r: any) => r.status === 'revoked').length,
    };

    res.json({ stats, licenses: rows });
  }),
);

// ─── GET /api/licenses/stats ──────────────────────────────────────────────────
// Admin-only: high-level stats for Discord bot / admin panel.

router.get(
  '/stats',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [licenseStats, userStats, trialStats] = await Promise.all([
      query(
        `SELECT
           count(*)::int AS total_keys,
           count(*) FILTER (WHERE status = 'unused')::int AS unused_keys,
           count(*) FILTER (WHERE status = 'redeemed')::int AS active_keys,
           count(*) FILTER (WHERE status = 'revoked')::int AS revoked_keys,
           count(*) FILTER (WHERE tier = 'pro')::int AS pro_keys,
           count(*) FILTER (WHERE tier = 'free')::int AS free_keys
         FROM licenses`,
      ),
      query(
        `SELECT
           count(*)::int AS total_users,
           count(*) FILTER (WHERE plan = 'pro')::int AS pro_users,
           count(*) FILTER (WHERE plan = 'free')::int AS free_users
         FROM users`,
      ),
      query(
        `SELECT
           count(*)::int AS total_trials,
           sum(videos_used)::int AS total_videos_used
         FROM free_trials`,
      ),
    ]);

    res.json({
      licenses: licenseStats.rows[0],
      users: userStats.rows[0],
      trials: trialStats.rows[0],
    });
  }),
);

export default router;
