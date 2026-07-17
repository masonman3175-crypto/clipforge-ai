'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Copy, Check, Flame, Scissors } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, Input } from '@/components/ui/misc';
import { formatDuration } from '@/lib/utils';
import { PublishBar } from '@/components/clips/publish-bar';

const CAPTION_STYLES = ['bold-center', 'karaoke-yellow', 'minimal', 'hormozi'];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [project, setProject] = useState<any>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api(`/videos/${id}`).then((p) => {
      setProject(p);
      setSelected(search.get('clip') ?? p.clips?.[0]?.id ?? null);
    });
  }, [id, search]);

  const clip = useMemo(
    () => project?.clips?.find((c: any) => c.id === selected) ?? null,
    [project, selected],
  );

  if (!project) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="truncate text-2xl font-semibold">{project.title}</h1>
        <p className="text-sm text-muted-foreground">
          {project.clips?.length ?? 0} clips · {project.duration_sec ? formatDuration(project.duration_sec) : '—'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Clip list */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Clips</h2>
          {project.clips?.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelected(c.id)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                selected === c.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <Badge variant="muted">{c.category}</Badge>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Flame className="h-3 w-3 text-orange-400" /> {c.virality_score}
                </span>
              </div>
              <div className="mt-1.5 line-clamp-2 text-sm">{c.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatDuration(c.start_sec)} → {formatDuration(c.end_sec)}
              </div>
            </button>
          ))}
        </div>

        {/* Editor */}
        {clip ? (
          <ClipEditor clip={clip} sourceUrl={project.sourceUrl} onChange={(updated) =>
            setProject((p: any) => ({ ...p, clips: p.clips.map((c: any) => (c.id === updated.id ? updated : c)) }))
          } />
        ) : (
          <Card><CardContent className="py-16 text-center text-muted-foreground">Select a clip to edit.</CardContent></Card>
        )}
      </div>
    </div>
  );
}

function ClipEditor({ clip, sourceUrl, onChange }: { clip: any; sourceUrl: string | null; onChange: (c: any) => void }) {
  const [title, setTitle] = useState(clip.title);
  const [style, setStyle] = useState(clip.caption_style);
  const [captions, setCaptions] = useState<any[]>(clip.captions ?? []);
  const [cropX, setCropX] = useState<number>(clip.crop_x ?? 0.5);
  const [layout, setLayout] = useState<'fit' | 'fill'>(clip.layout ?? 'fit');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(clip.title); setStyle(clip.caption_style); setCaptions(clip.captions ?? []);
    setCropX(clip.crop_x ?? 0.5); setLayout(clip.layout ?? 'fit');
  }, [clip.id]);

  async function save() {
    setSaving(true);
    const updated = await api(`/clips/${clip.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, caption_style: style, captions, crop_x: cropX, layout }),
    });
    onChange(updated);
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Player + preview */}
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-lg bg-black">
          {sourceUrl ? (
            <video
              src={`${sourceUrl}#t=${clip.start_sec},${clip.end_sec}`}
              controls
              className={layout === 'fit' ? 'max-h-full w-full object-contain' : 'h-full w-full object-cover'}
              style={layout === 'fill' ? { objectPosition: `${cropX * 100}% center` } : undefined}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preview</div>
          )}
        </div>
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground">Clip title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />

          <label className="text-xs text-muted-foreground">Caption style</label>
          <div className="flex flex-wrap gap-2">
            {CAPTION_STYLES.map((s) => (
              <button
                key={s}
                onClick={() => setStyle(s)}
                className={`rounded-md px-2.5 py-1 text-xs capitalize ${style === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {s.replace('-', ' ')}
              </button>
            ))}
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Layout</label>
            <div className="flex gap-2">
              <button
                onClick={() => setLayout('fit')}
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs ${layout === 'fit' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                Fit — whole screen + blurred bars
              </button>
              <button
                onClick={() => setLayout('fill')}
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs ${layout === 'fill' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                Fill — crop / zoom in
              </button>
            </div>
          </div>

          {layout === 'fill' && (
            <div>
              <label className="text-xs text-muted-foreground">Crop position</label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Left</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={cropX}
                  onChange={(e) => setCropX(parseFloat(e.target.value))}
                  className="h-2 flex-1 cursor-pointer accent-primary"
                />
                <span className="text-xs text-muted-foreground">Right</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Drag to reframe — the preview updates live.</p>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            <Scissors className="h-3.5 w-3.5" /> {formatDuration(clip.start_sec)} → {formatDuration(clip.end_sec)} ({formatDuration(clip.end_sec - clip.start_sec)})
          </div>

          <Button onClick={save} disabled={saving} size="sm">{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      </div>

      {/* Publish: download + guided upload to TikTok / Reels / Shorts */}
      <PublishBar clip={clip} />

      {/* Editable captions (word-by-word) */}
      <Card><CardContent className="pt-6">
        <h3 className="mb-3 text-sm font-medium">Captions (word-by-word · click to edit)</h3>
        <div className="flex flex-wrap gap-1.5">
          {captions.length === 0 && <span className="text-sm text-muted-foreground">No captions detected.</span>}
          {captions.map((tok, i) => (
            <input
              key={i}
              value={tok.word}
              onChange={(e) => setCaptions((c) => c.map((t, j) => (j === i ? { ...t, word: e.target.value } : t)))}
              className="rounded bg-muted px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
              style={{ width: `${Math.max(3, tok.word.length + 1)}ch` }}
            />
          ))}
        </div>
      </CardContent></Card>

      {/* Hooks / Titles / Hashtags */}
      <div className="grid gap-4 md:grid-cols-3">
        <CopyList title="Viral hooks" items={clip.hooks ?? []} />
        <CopyList title="Titles" items={Object.entries(clip.titles ?? {}).map(([k, v]) => `${k}: ${v}`)} />
        <CopyList title="Hashtags" items={[...(clip.hashtags?.trending ?? []), ...(clip.hashtags?.niche ?? []), ...(clip.hashtags?.seo ?? [])]} />
      </div>
    </div>
  );
}

function CopyList({ title, items }: { title: string; items: string[] }) {
  const [copied, setCopied] = useState<number | null>(null);
  return (
    <Card><CardContent className="pt-6">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="group flex items-start justify-between gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
            <span className="min-w-0 break-words">{item}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(item); setCopied(i); setTimeout(() => setCopied(null), 1200); }}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              {copied === i ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          </li>
        ))}
      </ul>
    </CardContent></Card>
  );
}
