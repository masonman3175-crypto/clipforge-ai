'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * OAuth return handler (implicit flow, handled manually).
 *
 * Supabase returns the session in the URL fragment:
 *   /auth/callback#access_token=…&refresh_token=…&expires_in=…
 * We read those tokens and set the session explicitly. If they aren't present,
 * we surface exactly what the URL *did* contain, so any remaining problem is
 * diagnosable instead of silent.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const search = new URLSearchParams(window.location.search);

    // 1. Provider/Supabase error?
    const urlError =
      hash.get('error_description') ||
      search.get('error_description') ||
      hash.get('error') ||
      search.get('error');
    if (urlError) {
      setError(decodeURIComponent(urlError));
      return;
    }

    // 2. Tokens in the fragment (implicit flow) → set the session directly.
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) setError(error.message);
        else router.replace('/dashboard');
      });
      return;
    }

    // 3. A PKCE code instead? Exchange it.
    const code = search.get('code');
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setError(`code exchange failed: ${error.message}`);
        else router.replace('/dashboard');
      });
      return;
    }

    // 4. Nothing usable — report what actually came back.
    const hashKeys = [...hash.keys()];
    const queryKeys = [...search.keys()];
    setError(
      `No login token was returned. The address contained — fragment: [${hashKeys.join(', ') || 'empty'}], query: [${queryKeys.join(', ') || 'empty'}].`,
    );
  }, [router]);

  return (
    <main className="glow-bg flex min-h-screen items-center justify-center px-6 text-center">
      {error ? (
        <div className="max-w-md space-y-2">
          <p className="font-medium text-destructive">Sign-in error</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <a href="/sign-in" className="text-primary">Back to sign in</a>
        </div>
      ) : (
        <p className="text-muted-foreground">Signing you in…</p>
      )}
    </main>
  );
}
