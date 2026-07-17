'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Upload, Clapperboard, Film, Download, Crown, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, Progress } from '@/components/ui/misc';

interface Me {
  videos_processed: number;
  clips_generated: number;
  clips_exported: number;
  videos_this_month: number;
  top_caption_style: string | null;
  plan: 'free' | 'pro';
}

export default function DashboardHome() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    api<Me>('/analytics/me').then(setMe).catch(() => setMe(null));
  }, []);

  const stats = [
    { label: 'Videos processed', value: me?.videos_processed ?? 0, icon: Film },
    { label: 'Clips generated', value: me?.clips_generated ?? 0, icon: Clapperboard },
    { label: 'Clips exported', value: me?.clips_exported ?? 0, icon: Download },
  ];

  const isPro = me?.plan === 'pro';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Home</h1>
          <p className="text-sm text-muted-foreground">Your ClipForge activity at a glance.</p>
        </div>
        <Link href="/dashboard/upload">
          <Button className="gap-2"><Upload className="h-4 w-4" /> New video</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className="rounded-lg bg-primary/15 p-3"><s.icon className="h-5 w-5 text-primary" /></div>
              <div>
                <div className="text-2xl font-semibold">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Access Status</span>
              <Badge variant={isPro ? 'accent' : 'muted'}>
                {isPro ? 'Pro - Unlimited' : 'Free Trial'}
              </Badge>
            </div>
            {isPro ? (
              <p className="text-sm text-muted-foreground">You have unlimited video processing.</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Upload 1 video to try ClipForge. Need more? Get a key from Discord.
                </p>
                <Link href="/dashboard/billing">
                  <Button variant="outline" size="sm" className="gap-2">
                    <KeyRound className="h-4 w-4" /> Get License Key
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <span className="text-sm font-medium">Most-used caption style</span>
            <div className="text-lg font-semibold capitalize">
              {me?.top_caption_style?.replace('-', ' ') ?? '---'}
            </div>
            {!isPro && (
              <Link href="/dashboard/billing">
                <Button variant="outline" size="sm" className="mt-2 gap-2">
                  <Crown className="h-4 w-4 text-amber-400" /> Upgrade for premium styles
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
