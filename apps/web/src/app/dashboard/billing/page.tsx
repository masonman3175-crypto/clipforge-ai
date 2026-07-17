'use client';

import { useEffect, useState } from 'react';
import { Check, Crown, KeyRound, Shield, AlertTriangle, ExternalLink } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, Input } from '@/components/ui/misc';

interface LicenseInfo {
  valid: boolean;
  tier: string | null;
  expiresAt: string | null;
  devicesUsed: number;
  maxDevices: number;
}

interface TrialInfo {
  videos_used: number;
  max_videos: number;
}

interface Me {
  plan: 'free' | 'pro';
  trial: TrialInfo;
  licenses: Array<{
    tier: string;
    status: string;
    redeemed_at: string;
    expires_at: string | null;
  }>;
}

export default function BillingPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Me>('/licenses/me').then(setMe).catch(() => setMe(null));
    api<LicenseInfo>('/licenses/validate', {
      method: 'POST',
      body: JSON.stringify({}),
    }).then(setLicense).catch(() => setLicense(null));
  }, []);

  async function redeem() {
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      // Generate a simple device fingerprint
      const fp = navigator.userAgent + screen.width + screen.height + navigator.language;
      const result = await api<{ ok: boolean; plan: string; message?: string }>('/licenses/redeem', {
        method: 'POST',
        body: JSON.stringify({ code, deviceFingerprint: fp }),
      });
      setRedeemMsg({ ok: true, text: result.message || "Key activated! You now have unlimited access." });
      // Refresh data
      const updated = await api<Me>('/licenses/me');
      setMe(updated);
      const updatedLicense = await api<LicenseInfo>('/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({ deviceFingerprint: fp }),
      });
      setLicense(updatedLicense);
      setCode('');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Could not activate this key';
      setRedeemMsg({ ok: false, text: msg });
    } finally {
      setRedeeming(false);
    }
  }

  const isPro = me?.plan === 'pro' || license?.valid;
  const trialUsed = me?.trial?.videos_used ?? 0;
  const trialMax = me?.trial?.max_videos ?? 1;
  const trialRemaining = Math.max(0, trialMax - trialUsed);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">License & Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your ClipForge AI license key.
        </p>
      </div>

      {/* Current Status */}
      <Card className={isPro ? 'border-emerald-500/50' : 'border-amber-500/50'}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-lg font-semibold">
              {isPro ? (
                <>
                  <Crown className="h-5 w-5 text-amber-400" /> Pro Access
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5 text-muted-foreground" /> Free Trial
                </>
              )}
            </div>
            <Badge variant={isPro ? 'accent' : 'muted'}>
              {isPro ? 'Active' : `${trialRemaining} video${trialRemaining !== 1 ? 's' : ''} left`}
            </Badge>
          </div>

          {isPro ? (
            <div className="space-y-2 text-sm">
              <p className="text-emerald-400">You have full access to all features.</p>
              {license?.expiresAt && (
                <p className="text-muted-foreground">
                  Expires: {new Date(license.expiresAt).toLocaleDateString()}
                </p>
              )}
              {license?.maxDevices && license.maxDevices > 1 && (
                <p className="text-muted-foreground">
                  Devices: {license.devicesUsed}/{license.maxDevices} used
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                You&apos;re on the free trial. You can process <strong>1 video</strong> to try ClipForge.
              </p>
              {trialRemaining <= 0 && (
                <div className="flex items-center gap-2 text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Trial used up. Enter a license key to continue.</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* License Key Entry */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-2 font-medium">
            <KeyRound className="h-4 w-4 text-primary" /> Enter License Key
          </div>
          <p className="text-sm text-muted-foreground">
            Get a key from our Discord server after purchasing. Each key works on 1 device.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="CLIP-XXXX-XXXX"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="font-mono uppercase"
            />
            <Button onClick={redeem} disabled={redeeming || code.trim().length < 4}>
              {redeeming ? 'Activating...' : 'Activate'}
            </Button>
          </div>
          {redeemMsg && (
            <p className={`text-sm ${redeemMsg.ok ? 'text-emerald-400' : 'text-destructive'}`}>
              {redeemMsg.text}
            </p>
          )}
        </CardContent>
      </Card>

      {/* How to get a key */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center gap-2 font-medium">
            Get a License Key
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>1. Join our Discord server</p>
            <p>2. Pay via Zelle, CashApp, or Venmo</p>
            <p>3. A bot will send you a license key instantly</p>
            <p>4. Enter the key above to unlock unlimited access</p>
          </div>
          <a href="https://discord.gg/YOUR_SERVER_INVITE" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2">
              Join Discord Server <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Free Trial</div>
              {isPro && <Badge variant="muted">Expired</Badge>}
            </div>
            <div className="text-3xl font-bold">$0</div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> 1 video to try</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> AI clip detection</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Auto captions</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-primary/50">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Crown className="h-5 w-5 text-amber-400" /> Pro
              </div>
              {isPro && <Badge variant="success">Active</Badge>}
            </div>
            <div className="text-3xl font-bold">License</div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Unlimited videos</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Unlimited clips</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> All caption styles</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Priority rendering</li>
              <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> No watermark</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
