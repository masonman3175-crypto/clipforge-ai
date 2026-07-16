'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client for auth (sign-in/up, session, and reading the
 * access token we forward to the Express API as a Bearer token).
 */
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
