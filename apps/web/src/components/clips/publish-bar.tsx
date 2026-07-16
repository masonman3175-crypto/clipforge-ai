'use client';

import { useState } from 'react';
import { Download, Check, ExternalLink, Copy, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * "Download + guided upload" publishing. No platform OAuth/approval needed:
 * we download the correctly-sized 1080×1920 clip, copy a platform-tuned caption
 * (title + hashtags) to the clipboard, and open the platform's uploader in a new
 * tab so the user just pastes and posts.
 */
const PLATFORMS = [
  {
    key: 'tiktok' as const,
    label: 'TikTok',
    uploadUrl: 'https://www.tiktok.com/upload',
    color: 'hover:border-pink-500/60',
  },
  {
    key: 'reel' as const,
    label: 'Instagram Reels',
    uploadUrl: 'https://www.instagram.com/',
    color: 'hover:border-fuchsia-500/60',
  },
  {
    key: 'shorts' as const,
    label: 'YouTube Shorts',
    uploadUrl: 'https://www.youtube.com/upload',
    color: 'hover:border-red-500/60',
  },
];

export function PublishBar({ clip }: { clip: any }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function captionFor(key: 'tiktok' | 'reel' | 'shorts') {
    const title = clip.titles?.[key] ?? clip.title;
    const tags = [
      ...(clip.hashtags?.trending ?? []),
      ...(clip.hashtags?.niche ?? []),
      ...(clip.hashtags?.seo ?? []),
    ].join(' ');
    return `${title}\n\n${tags}`.trim();
  }

  async function publish(p: (typeof PLATFORMS)[number]) {
    setBusy(p.key);
    try {
      // 1. Copy the platform caption so the user can paste it after upload.
      await navigator.clipboard.writeText(captionFor(p.key)).catch(() => {});

      // 2. Get the export and download it (skip in demo where url is a '#...').
      const { url } = await api<{ url: string }>(`/clips/${clip.id}/download`);
      if (url && !url.startsWith('#')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `clipforge-${p.key}-${clip.id}.mp4`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      // 3. Open the platform uploader in a new tab.
      window.open(p.uploadUrl, '_blank', 'noopener');

      setDone(p.key);
      setTimeout(() => setDone(null), 4000);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Publish this clip</h3>
        <span className="text-xs text-muted-foreground">1080×1920 · vertical</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            disabled={busy !== null}
            onClick={() => publish(p)}
            className={`flex flex-col items-center gap-1 rounded-md border border-border bg-background px-3 py-3 text-sm transition-colors disabled:opacity-50 ${p.color}`}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {busy === p.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : done === p.key ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {p.label}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ExternalLink className="h-3 w-3" /> {busy === p.key ? 'rendering…' : 'download + open'}
            </span>
          </button>
        ))}
      </div>

      {busy && (
        <p className="text-xs text-muted-foreground">
          Rendering your 1080×1920 clip with captions… this takes ~10–30s the first time.
        </p>
      )}
      {done && !busy && (
        <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          ✓ Clip downloaded and caption copied to your clipboard. Paste it into the {PLATFORMS.find((p) => p.key === done)?.label} uploader that just opened.
        </p>
      )}

      {/* Caption preview */}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs text-muted-foreground">Preview captions & copy manually</summary>
        <div className="mt-2 space-y-2">
          {(['tiktok', 'reel', 'shorts'] as const).map((k) => (
            <CaptionRow key={k} label={PLATFORMS.find((p) => p.key === k)!.label} text={captionFor(k)} />
          ))}
        </div>
      </details>
    </div>
  );
}

function CaptionRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
