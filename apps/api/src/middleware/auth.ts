import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { supabaseAdmin } from '../services/storage.js';

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  plan: 'free' | 'pro';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Validates the Supabase-issued access token from `Authorization: Bearer <token>`
 * by asking Supabase Auth to resolve it (`supabaseAdmin.auth.getUser`). This works
 * with both legacy (HS256 shared-secret) and the newer asymmetric signing keys,
 * so no local JWT secret is required. Then upserts a local `users` row so our app
 * tables can foreign-key against it, and attaches the user to `req.user`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }
    const token = header.slice('Bearer '.length);

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const authUser = data.user;
    const id = authUser.id;
    const email = authUser.email?.toLowerCase();
    if (!id || !email) return res.status(401).json({ error: 'Invalid token claims' });

    const role: AuthUser['role'] = env.adminEmails.includes(email) ? 'admin' : 'user';
    const meta = authUser.user_metadata as { full_name?: string; avatar_url?: string } | undefined;

    // Upsert keeps our mirror table in sync on every authenticated request.
    const { rows } = await query<AuthUser>(
      `INSERT INTO users (id, email, full_name, avatar_url, role)
         VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             role  = EXCLUDED.role
       RETURNING id, email, role, plan`,
      [id, email, meta?.full_name ?? null, meta?.avatar_url ?? null, role],
    );

    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
