'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { IS_DEMO } from '@/lib/demo';
import { Sidebar } from '@/components/dashboard/sidebar';

/**
 * Client-side auth guard. Redirects to /sign-in when there is no session and
 * renders the persistent dashboard shell (sidebar + content) otherwise.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (IS_DEMO) {
      setIsAdmin(true);
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/sign-in');
        return;
      }
      // Admin flag is derived server-side too; this only toggles the nav link.
      const email = data.session.user.email?.toLowerCase() ?? '';
      const admins = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase());
      setIsAdmin(admins.includes(email));
      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
    );
  }

  return (
    <div className="glow-bg flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
    </div>
  );
}
