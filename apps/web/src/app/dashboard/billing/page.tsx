'use client';

import { useEffect, useState } from 'react';
import { Check, Crown, KeyRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, Input } from '@/components/ui/misc';

export default function BillingPage() {
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => { api<{ plan: 'free' | 'pro' }>('/analytics/me').then((m) => setPlan(m.plan)); }, []);

  async function redeem() {
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      await api('/licenses/redeem', { method: 'POST', body: JSON.stringify({ code }) });
      setPlan('pro');
      setCode('');
      setRedeemMsg({ ok: true, text: "🎉 Redeemed! You're now on Pro with unlimited access." });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not redeem this code';
      setRedeemMsg({ ok: false, text: msg });
    } finally {
      setRedeeming(false);
    }
  }

  async function upgrade() {
    setLoading(true);
    try {
      const { url } = await api<{ url: string }>('/billing/checkout', { method: 'POST' });
      window.location.href = url;
    } catch (e) {
      alert('Billing is not configured yet. Add your Stripe keys to enable checkout.');
      setLoading(false);
    }
  }

  async function manage() {
    const { url } = await api<{ url: string }>('/billing/portal', { method: 'POST' });
    window.location.href = url;
  }

  const plans = [
    {
      name: 'Free', price: '$0', tier: 'free' as const,
      features: ['3 videos / month', 'Up to 10 clips per video', 'Standard caption styles', '1080×1920 exports'],
    },
    {
      name: 'Pro', price: '$29', tier: 'pro' as const,
      features: ['Unlimited videos', 'Unlimited clips', 'Premium caption styles', 'Priority rendering', 'No watermark'],
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="text-sm text-muted-foreground">You are on the <span className="font-medium capitalize">{plan}</span> plan.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.name} className={p.tier === 'pro' ? 'border-primary/50' : ''}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  {p.tier === 'pro' && <Crown className="h-5 w-5 text-amber-400" />} {p.name}
                </div>
                {plan === p.tier && <Badge variant="success">Current</Badge>}
              </div>
              <div className="text-3xl font-bold">{p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
              <ul className="space-y-2 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> {f}</li>
                ))}
              </ul>
              {p.tier === 'pro' && plan === 'free' && (
                <Button className="w-full" onClick={upgrade} disabled={loading}>{loading ? 'Redirecting…' : 'Upgrade to Pro'}</Button>
              )}
              {p.tier === 'pro' && plan === 'pro' && (
                <Button className="w-full" variant="outline" onClick={manage}>Manage subscription</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Redeem a license code */}
      {plan === 'free' && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2 font-medium">
              <KeyRound className="h-4 w-4 text-primary" /> Have a license code?
            </div>
            <p className="text-sm text-muted-foreground">
              Enter the code you received to unlock unlimited (Pro) access.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="CLIP-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <Button onClick={redeem} disabled={redeeming || code.trim().length < 4}>
                {redeeming ? 'Redeeming…' : 'Redeem'}
              </Button>
            </div>
            {redeemMsg && (
              <p className={`text-sm ${redeemMsg.ok ? 'text-emerald-400' : 'text-destructive'}`}>{redeemMsg.text}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
