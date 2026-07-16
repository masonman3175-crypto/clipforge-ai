'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * OAuth return handler.
 *
 * With the implicit flow, Supabase returns the session token in the URL fragment
 * (#access_token=…). The supabase-js client parses it automatically on load
 * (detectSessionInUrl), so we poll for the resulting session and forward on.
 *
 * If Supabase instead returned an error (in the query string or the fragment),
 * we surface it verbatim so problems are diagnosable rather than silent.
 */
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Surface any provider/Supabase error returned in the URL.
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const urlError =
      search.get('error_description') ||
      search.get('error') ||
      hash.get('error_description') ||
      hash.get('error');
    if (urlError) {
      setError(decodeURIComponent(urlError));
      return;
    }

    let finished = false;
    const go = () => {
      if (!finished) {
        finished = true;
        router.replace('/dashboard');
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });

    let tries = 0;
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        clearInterval(interval);
        go();
      } else if (++tries > 30) {
        clearInterval(interval);
        setError('Sign-in did not complete (no session returned). Please try again.');
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
