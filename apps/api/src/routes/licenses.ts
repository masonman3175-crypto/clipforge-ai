import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { query, withTransaction } from '../db/pool.js';

const router = Router();

/**
 * POST /api/licenses/redeem { code }
 * Redeems a prepaid license code to unlock Pro (unlimited) access for the user.
 * Each code works exactly once.
 */
const redeemSchema = z.object({ code: z.string().min(4) });
router.post(
  '/redeem',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = redeemSchema.parse(req.body);
    const normalized = code.trim().toUpperCase();

    await withTransaction(async (c) => {
      // Lock the row so two people can't redeem the same code simultaneously.
      const { rows } = await c.query<{ id: string; status: string }>(
        `SELECT id, status FROM licenses WHERE code = $1 FOR UPDATE`,
        [normalized],
      );
      const lic = rows[0];
      if (!lic) throw new ApiError(404, 'Invalid license code');
      if (lic.status === 'redeemed') throw new ApiError(409, 'This code has already been used');
      if (lic.status !== 'unused') throw new ApiError(403, 'This code is no longer valid');

      await c.query(
        `UPDATE licenses SET status = 'redeemed', redeemed_by = $2, redeemed_at = now() WHERE id = $1`,
        [lic.id, req.user!.id],
      );
      await c.query(`UPDATE users SET plan = 'pro' WHERE id = $1`, [req.user!.id]);
    });

    res.json({ ok: true, plan: 'pro' });
  }),
);

/** GET /api/licenses/admin — all codes + status, for the owner to distribute/track. */
router.get(
  '/admin',
  requireAuth,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT l.code, l.status, l.redeemed_at, u.email AS redeemed_by_email
         FROM licenses l
         LEFT JOIN users u ON u.id = l.redeemed_by
        ORDER BY l.status DESC, l.created_at`,
    );
    const unused = rows.filter((r: any) => r.status === 'unused').length;
    res.json({ total: rows.length, unused, redeemed: rows.length - unused, licenses: rows });
  }),
);

export default router;
