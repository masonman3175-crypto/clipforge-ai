'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Film, Clapperboard, TrendingUp, Shield, KeyRound, Copy, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { IS_DEMO } from '@/lib/demo';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/utils';

interface LicenseStats {
  total_keys: number;
  unused_keys: number;
  active_keys: number;
  revoked_keys: number;
  pro_keys: number;
  free_keys: number;
}

interface PlatformStats {
  licenses: LicenseStats;
  users: UserStats;
  trials: { total: number; videos: number };
}

interface UserStats {
  total_users: number;
  pro_users: number;
  free_users: number;
}

interface License {
  code: string;
  tier: string;
  status: string;
  max_devices: number;
  redeemed_by_email: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  notes: string | null;
  validation_count: number;
}

/**
 * Admin panel with license management.
 */
export default function AdminPage() {
  const router = useRouter();
  const [licenseStats, setLicenseStats] = useState<LicenseStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [denied, setDenied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newKeys, setNewKeys] = useState<string[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [generateCount, setGenerateCount] = useState(1);

  useEffect(() => {
    if (IS_DEMO) {
      setLicenseStats({ total_keys: 12, unused_keys: 5, active_keys: 6, revoked_keys: 1, pro_keys: 6, free_keys: 6 });
      setUserStats({ total_users: 24, pro_users: 8, free_users: 16 });
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return router.replace('/sign-in');
      Promise.all([
        api<{ stats: LicenseStats; licenses: License[] }>('/licenses/admin'),
        api<PlatformStats>('/licenses/stats'),
        api<any[]>('/admin/users'),
      ])
        .then(([licAdmin, platformStats, userList]) => {
          setLicenseStats(licAdmin.stats);
          setLicenses(licAdmin.licenses);
          setUserStats(platformStats.users);
          setUsers(userList);
        })
        .catch(() => setDenied(true));
    });
  }, [router]);

  async function generateKeys() {
    setGenerating(true);
    try {
      const result = await api<{ keys: string[]; count: number }>('/licenses/generate', {
        method: 'POST',
        body: JSON.stringify({ tier: 'pro', count: generateCount, maxDevices: 1 }),
      });
      setNewKeys(result.keys);
      // Refresh the list
      const updated = await api<{ stats: LicenseStats; licenses: License[] }>('/licenses/admin');
      setLicenseStats(updated.stats);
      setLicenses(updated.licenses);
    } catch (e) {
      alert('Failed to generate keys');
    } finally {
      setGenerating(false);
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">Admin access required</h1>
        <p className="text-sm text-muted-foreground">Your account is not on the admin list.</p>
      </div>
    );
  }
  if (!licenseStats || !userStats) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Shield className="h-5 w-5 text-accent" /> Admin
        </h1>
        <p className="text-sm text-muted-foreground">Platform overview and license management.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 pt-6">
          <div className="rounded-lg bg-accent/15 p-2.5"><Users className="h-5 w-5 text-accent" /></div>
          <div><div className="text-xl font-semibold">{userStats.total_users}</div><div className="text-xs text-muted-foreground">Total users</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6">
          <div className="rounded-lg bg-emerald-500/15 p-2.5"><TrendingUp className="h-5 w-5 text-emerald-400" /></div>
          <div><div className="text-xl font-semibold">{userStats.pro_users}</div><div className="text-xs text-muted-foreground">Pro users</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6">
          <div className="rounded-lg bg-primary/15 p-2.5"><KeyRound className="h-5 w-5 text-primary" /></div>
          <div><div className="text-xl font-semibold">{licenseStats.unused_keys}</div><div className="text-xs text-muted-foreground">Unused keys</div></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 pt-6">
          <div className="rounded-lg bg-amber-500/15 p-2.5"><Clapperboard className="h-5 w-5 text-amber-400" /></div>
          <div><div className="text-xl font-semibold">{licenseStats.active_keys}</div><div className="text-xs text-muted-foreground">Active keys</div></div>
        </CardContent></Card>
      </div>

      {/* Key Generator */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Generate License Keys
          </h2>
          <p className="text-sm text-muted-foreground">
            Create new Pro license keys to give to customers after they pay.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Count:</span>
              <select
                value={generateCount}
                onChange={(e) => setGenerateCount(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1 text-sm"
              >
                {[1, 2, 3, 5, 10, 25].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <Button onClick={generateKeys} disabled={generating} className="gap-2">
              <KeyRound className="h-4 w-4" />
              {generating ? 'Generating...' : `Generate ${generateCount} key${generateCount > 1 ? 's' : ''}`}
            </Button>
          </div>

          {newKeys.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-emerald-400">Generated keys (copy and send to customer):</p>
              <div className="space-y-1">
                {newKeys.map((key) => (
                  <div key={key} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 font-mono text-sm">
                    <span className="flex-1">{key}</span>
                    <button onClick={() => copyKey(key)} className="text-muted-foreground hover:text-foreground">
                      {copiedKey === key ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* License List */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-medium">All License Keys ({licenses.length})</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {licenses.map((lic) => (
              <div key={lic.code} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{lic.code}</span>
                    <Badge variant={
                      lic.status === 'redeemed' ? 'success' :
                      lic.status === 'revoked' ? 'warn' : 'muted'
                    }>
                      {lic.status}
                    </Badge>
                    <Badge variant={lic.tier === 'pro' ? 'accent' : 'muted'}>{lic.tier}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {lic.redeemed_by_email && `Used by ${lic.redeemed_by_email}`}
                    {lic.redeemed_at && ` - ${timeAgo(lic.redeemed_at)}`}
                    {lic.expires_at && ` - Expires ${new Date(lic.expires_at).toLocaleDateString()}`}
                    {lic.validation_count > 0 && ` - ${lic.validation_count} validations`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyKey(lic.code)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {copiedKey === lic.code ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="mb-3 text-sm font-medium">Users ({users.length})</h2>
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <div className="truncate">{u.email}</div>
                  <div className="text-xs text-muted-foreground">{u.videos} videos - {u.clips} clips</div>
                </div>
                <Badge variant={u.plan === 'pro' ? 'accent' : 'muted'}>{u.plan}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
