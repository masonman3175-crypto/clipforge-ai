'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sparkles, Github } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/misc';

/** Google's multicolor "G" mark. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Redirect to the provider; on return, /auth/callback finishes the login. */
  async function oauth(provider: 'google' | 'github') {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fn =
      mode === 'sign-up'
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
    const { error } = await fn;
    setLoading(false);
    if (error) return setError(error.message);
    router.push('/dashboard');
  }

  return (
    <main className="glow-bg flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" /> ClipForge AI
          </div>
          <CardTitle>{mode === 'sign-up' ? 'Create your account' : 'Welcome back'}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Social login — the easy path */}
          <div className="space-y-2">
            <Button variant="outline" className="w-full gap-2" onClick={() => oauth('google')}>
              <GoogleIcon /> Continue with Google
            </Button>
            <Button variant="outline" className="w-full gap-2" onClick={() => oauth('github')}>
              <Github className="h-4 w-4" /> Continue with GitHub
            </Button>
          </div>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" variant="ghost" className="w-full" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'sign-up' ? 'Sign up with email' : 'Sign in with email'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'sign-up' ? (
              <>Already have an account? <Link href="/sign-in" className="text-primary">Sign in</Link></>
            ) : (
              <>New here? <Link href="/sign-up" className="text-primary">Create an account</Link></>
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
