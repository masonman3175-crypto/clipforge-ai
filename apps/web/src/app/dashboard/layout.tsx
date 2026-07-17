'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { IS_DEMO } from '@/lib/demo';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Button } from '@/components/ui/button';

interface LicenseStatus {
  valid: boolean;
  tier: string | null;
  trialRemaining: number;
  hasTrial: boolean;
  needsKey: boolean;
  message?: string;
}

/**
 * Client-side auth guard. Redirects to /sign-in when there is no session and
 * renders the persistent dashboard shell (sidebar + content) otherwise.
 * Also checks license status and shows a banner if the user needs a key.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [license, setLicense] = useState<LicenseStatus | null>(null);

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

      // Check license status
      const fp = navigator.userAgent + screen.width + screen.height + navigator.language;
      api<LicenseStatus>('/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: fp }),
      }).then(setLicense).catch(() => setLicense(null));

      setReady(true);
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div className="glow-bg flex min-h-screen">
      <Sidebar isAdmin={isAdmin} />
      <div className="flex-1 flex flex-col overflow-y-auto">
        {/* License required banner */}
        {license?.needsKey && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <KeyRound className="h-4 w-4 text-amber-400" />
                <span className="text-amber-200">
                  Your free trial is used up. Enter a license key to continue using ClipForge.
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-amber-500/30 text-amber-200 hover:bg-amber-500/20"
                onClick={() => router.push('/dashboard/billing')}
              >
                Enter Key
              </Button>
            </div>
          </div>
        )}

        {/* Free trial remaining banner */}
        {license && !license.valid && !license.needsKey && license.trialRemaining > 0 && (
          <div className="border-b border-primary/30 bg-primary/10 px-6 py-3">
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-primary" />
              <span className="text-primary/90">
                Free trial: {license.trialRemaining} video{license.trialRemaining !== 1 ? 's' : ''} remaining.
                Get a key from our Discord for unlimited access.
              </span>
            </div>
          </div>
        )}

        <main className="flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
