'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * OAuth return handler. The standard supabase-js client auto-exchanges the
 * `?code=` in the URL on load (detectSessionInUrl) using the localStorage code
 * verifier, so we must NOT exchange it again. We simply poll for the resulting
 * session (up to ~15s) and forward to the dashboard once it appears.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let finished = false;
    const go = () => {
      if (!finished) {
        finished = true;
        router.replace('/dashboard');
      }
    };

    // Fires as soon as the auto-exchange completes.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    // Poll as a backup (covers timing/races), up to ~15 seconds.
    let tries = 0;
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        clearInterval(interval);
        go();
      } else if (++tries > 30) {
        clearInterval(interval);
        setError('Sign-in did not complete. Please try again.');
      }
    }, 500);

    return () => {
      sub.subscription.unsubscribe();
      clearInterval(interval);
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
