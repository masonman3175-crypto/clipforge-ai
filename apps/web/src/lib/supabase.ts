'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client for auth (sign-in/up, session, and reading the
 * access token we forward to the Express API as a Bearer token).
 */
// Use the implicit OAuth flow: the token comes back in the URL and is handled
// entirely in the browser, so we don't need server-side cookie/PKCE handling.
// This is the reliable choice for a client-rendered app like ours.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);
