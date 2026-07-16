'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Film, Clapperboard, TrendingUp, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { IS_DEMO } from '@/lib/demo';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';

/**
 * Admin panel. The API enforces admin access server-side (requireAdmin);
 * this page also guards the route and simply renders what the API returns.
 */
export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [uploads, setUploads] = useState<any[]>([]);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (IS_DEMO) {
      Promise.all([api('/admin/overview'), api('/admin/users'), api('/admin/uploads')])
        .then(([o, u, up]) => { setOverview(o); setUsers(u as any[]); setUploads(up as any[]); })
        .catch(() => setDenied(true));
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return router.replace('/sign-in');
      Promise.all([
        api('/admin/overview'),
        api('/admin/users'),
        api('/admin/uploads'),
      ])
        .then(([o, u, up]) => { setOverview(o); setUsers(u as any[]); setUploads(up as any[]); })
        .catch(() => setDenied(true));
    });
  }, [router]);

  if (denied) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">Your account is not on the admin list.</p>
      </div>
    );
  }
  if (!overview) return <p className="text-muted-foreground">Loading…</p>;

  const stats = [
    { label: 'Total users', value: overview.total_users, icon: Users },
    { label: 'Pro users', value: overview.pro_users, icon: TrendingUp },
    { label: 'Videos processed', value: overview.videos_processed, icon: Film },
    { label: 'Clips generated', value: overview.clips_generated, icon: Clapperboard },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Shield className="h-5 w-5 text-accent" /> Admin</h1>
        <p className="text-sm text-muted-foreground">Platform overview and management.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}><CardContent className="flex items-center gap-3 pt-6">
            <div className="rounded-lg bg-accent/15 p-2.5"><s.icon className="h-5 w-5 text-accent" /></div>
            <div><div className="text-xl font-semibold">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>
          </CardContent></Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-medium">Users</h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0"><div className="truncate">{u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.videos} videos · {u.clips} clips</div>
                </div>
                <Badge variant={u.plan === 'pro' ? 'accent' : 'muted'}>{u.plan}</Badge>
              </div>
            ))}
          </div>
        </CardContent></Card>

        <Card><CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-medium">Recent uploads</h2>
          <div className="space-y-2">
            {uploads.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0"><div className="truncate">{v.title}</div>
                  <div className="text-xs text-muted-foreground">{v.email} · {timeAgo(v.created_at)}</div>
                </div>
                <Badge variant={v.status === 'ready' ? 'success' : 'muted'}>{v.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
