import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

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
 * Verifies the Supabase-issued JWT from the `Authorization: Bearer <token>`
 * header, then upserts a local `users` row so our app tables can foreign-key
 * against it. Attaches the resolved user to `req.user`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }
    const token = header.slice('Bearer '.length);

    // Supabase signs access tokens with the project JWT secret (HS256).
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET) as jwt.JwtPayload;
    const id = payload.sub;
    const email = (payload.email as string | undefined)?.toLowerCase();
    if (!id || !email) return res.status(401).json({ error: 'Invalid token claims' });

    const role: AuthUser['role'] = env.adminEmails.includes(email) ? 'admin' : 'user';

    // Upsert keeps our mirror table in sync on every authenticated request.
    const { rows } = await query<AuthUser>(
      `INSERT INTO users (id, email, full_name, avatar_url, role)
         VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email,
             role  = EXCLUDED.role
       RETURNING id, email, role, plan`,
      [
        id,
        email,
        (payload.user_metadata as any)?.full_name ?? null,
        (payload.user_metadata as any)?.avatar_url ?? null,
        role,
      ],
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
