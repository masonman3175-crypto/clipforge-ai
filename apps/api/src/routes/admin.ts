import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { query } from '../db/pool.js';

const router = Router();
router.use(requireAuth, requireAdmin);

/** GET /api/admin/overview — headline metrics for the admin dashboard. */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const { rows } = await query('SELECT * FROM admin_overview');
    res.json(rows[0]);
  }),
);

/** GET /api/admin/users — paginated user list with usage counts. */
router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Number(req.query.offset ?? 0);
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.plan, u.created_at,
              (SELECT count(*) FROM videos v WHERE v.user_id = u.id)::int AS videos,
              (SELECT count(*) FROM clips c WHERE c.user_id = u.id)::int  AS clips
         FROM users u
        ORDER BY u.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json(rows);
  }),
);

/** GET /api/admin/uploads — recent uploads across all users. */
router.get(
  '/uploads',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT v.id, v.title, v.status, v.source, v.created_at, u.email
         FROM videos v JOIN users u ON u.id = v.user_id
        ORDER BY v.created_at DESC
        LIMIT 100`,
    );
    res.json(rows);
  }),
);

/** POST /api/admin/users/:id/plan — manually change a subscription. */
router.post(
  '/users/:id/plan',
  asyncHandler(async (req, res) => {
    const plan = req.body?.plan === 'pro' ? 'pro' : 'free';
    await query('UPDATE users SET plan = $2 WHERE id = $1', [req.params.id, plan]);
    res.json({ ok: true, plan });
  }),
);

export default router;
