'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, Youtube, Loader2 } from 'lucide-react';
import { api, uploadVideo, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Progress } from '@/components/ui/misc';

type Stage = 'idle' | 'uploading' | 'processing' | 'error';
const STAGE_LABEL: Record<string, string> = {
  queued: 'Queued',
  transcribing: 'Transcribing audio…',
  analyzing: 'Finding viral moments…',
  rendering: 'Rendering vertical clips…',
  ready: 'Done!',
  failed: 'Failed',
};

export default function UploadPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'file' | 'youtube'>('file');
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [ytUrl, setYtUrl] = useState('');

  // Poll processing status once we have a video id.
  useEffect(() => {
    if (!videoId || stage !== 'processing') return;
    const t = setInterval(async () => {
      try {
        const s = await api<{ status: string; progress: number; error_message?: string }>(`/videos/${videoId}/status`);
        setProgress(s.progress);
        setStatusText(STAGE_LABEL[s.status] ?? s.status);
        if (s.status === 'ready') {
          clearInterval(t);
          router.push(`/dashboard/projects/${videoId}`);
        } else if (s.status === 'failed') {
          clearInterval(t);
          setStage('error');
          setError(s.error_message ?? 'Processing failed');
        }
      } catch {
        /* transient — keep polling */
      }
    }, 2500);
    return () => clearInterval(t);
  }, [videoId, stage, router]);

  async function handleFile(file: File) {
    setError(null);
    setStage('uploading');
    setProgress(0);
    try {
      const { id } = await uploadVideo(file, file.name, setProgress);
      setVideoId(id);
      setStage('processing');
      setStatusText('Queued');
    } catch (e) {
      setStage('error');
      setError(e instanceof ApiError && e.status === 402 ? 'Free plan limit reached — upgrade to Pro.' : (e as Error).message);
    }
  }

  async function handleYouTube() {
    setError(null);
    setStage('processing');
    setStatusText('Queued');
    try {
      const { id } = await api<{ id: string }>('/videos/youtube', {
        method: 'POST',
        body: JSON.stringify({ url: ytUrl }),
      });
      setVideoId(id);
    } catch (e) {
      setStage('error');
      setError(e instanceof ApiError && e.status === 402 ? 'Free plan limit reached — upgrade to Pro.' : (e as Error).message);
    }
  }

  const busy = stage === 'uploading' || stage === 'processing';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload Video</h1>
        <p className="text-sm text-muted-foreground">MP4, MOV, or a YouTube URL. We handle the rest.</p>
      </div>

      {!busy && stage !== 'error' && (
        <div className="flex gap-2">
          <Button variant={tab === 'file' ? 'default' : 'outline'} size="sm" onClick={() => setTab('file')}>Upload file</Button>
          <Button variant={tab === 'youtube' ? 'default' : 'outline'} size="sm" onClick={() => setTab('youtube')}>YouTube URL</Button>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{busy ? 'Working on it' : tab === 'file' ? 'Choose a video' : 'Paste a link'}</CardTitle></CardHeader>
        <CardContent>
          {busy ? (
            <div className="space-y-4 py-4 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="font-medium">{stage === 'uploading' ? 'Uploading…' : statusText}</p>
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">
                {stage === 'uploading' ? `${progress}%` : 'Estimated 1–3 minutes depending on length'}
              </p>
            </div>
          ) : tab === 'file' ? (
            <div
              onClick={() => fileRef.current?.click()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              onDragOver={(e) => e.preventDefault()}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border py-12 text-center transition-colors hover:border-primary/50"
            >
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Drop a file or click to browse</p>
              <p className="text-xs text-muted-foreground">MP4 or MOV, up to 2GB</p>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4,video/quicktime"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-border px-3">
                <Youtube className="h-4 w-4 text-red-500" />
                <Input
                  className="border-0 px-0 focus-visible:ring-0"
                  placeholder="https://youtube.com/watch?v=…"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={!ytUrl} onClick={handleYouTube}>Import & generate clips</Button>
              <p className="text-xs text-muted-foreground">Only import content you own or have rights to repurpose.</p>
            </div>
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          {stage === 'error' && (
            <Button variant="outline" className="mt-4 w-full" onClick={() => { setStage('idle'); setError(null); }}>Try again</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
