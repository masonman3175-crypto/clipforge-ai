'use client';

import { createClient } from '@supabase/supabase-js';

/**
 * Strip any stray non-printable / non-ASCII characters. These can sneak into
 * environment values via copy-paste into hosting dashboards (zero-width spaces,
 * non-breaking spaces, smart quotes, stray newlines) and then break the HTTP
 * `apikey` / `Authorization` headers with:
 *   "String contains non ISO-8859-1 code point".
 * A valid Supabase URL or key is plain printable ASCII, so this only removes junk.
 */
export const cleanToken = (s: string | undefined | null) => (s || '').replace(/[^\x21-\x7E]/g, '');

const url = cleanToken(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = cleanToken(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // We handle the OAuth return ourselves in /auth/callback (implicit flow →
    // token in URL fragment) rather than relying on auto-detection.
    detectSessionInUrl: false,
    flowType: 'implicit',
  },
});
