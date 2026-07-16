'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Standard browser Supabase client for a client-rendered SPA.
 *
 * We use `@supabase/supabase-js` `createClient` (localStorage-backed) rather than
 * `@supabase/ssr`'s cookie client, because this app guards routes on the client
 * and has no server-side session handling. The standard client reliably:
 *   - stores the PKCE code verifier in localStorage (survives the OAuth redirect),
 *   - auto-detects and exchanges the `?code=` on the callback page,
 *   - persists + refreshes the session.
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Implicit flow returns the token directly in the URL fragment — no stored
      // code verifier to lose across the OAuth redirect. Most robust for a pure
      // client-side SPA with no server session handling.
      flowType: 'implicit',
    },
  },
);
