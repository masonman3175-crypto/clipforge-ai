'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * OAuth return handler. The Supabase browser client auto-exchanges the `?code=`
 * in the URL on load (detectSessionInUrl), so we must NOT exchange it again —
 * doing so throws "PKCE code verifier not found". Instead we just wait for the
 * resulting session and forward to the dashboard.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If the session is already established, go straight through.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/dashboard');
    });

    // Otherwise wait for the auto-exchange to complete.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace('/dashboard');
    });

    // Safety net: if nothing resolves, send them back to sign in.
    const timeout = setTimeout(
      () => setError('Sign-in did not complete. Please try again.'),
      8000,
    );

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <main className="glow-bg flex min-h-screen items-center justify-center px-6 text-center">
      {error ? (
        <div className="space-y-2">
          <p className="text-destructive">{error}</p>
          <a href="/sign-in" className="text-primary">Back to sign in</a>
        </div>
      ) : (
        <p className="text-muted-foreground">Signing you in…</p>
      )}
    </main>
  );
}
