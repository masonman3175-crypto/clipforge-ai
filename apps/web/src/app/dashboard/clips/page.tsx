'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clapperboard } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { ClipCard } from '@/components/clips/clip-card';

export interface Clip {
  id: string;
  video_id: string;
  video_title: string;
  title: string;
  category: string;
  start_sec: number;
  end_sec: number;
  virality_score: number;
  render_status: string;
}

export default function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { api<Clip[]>('/clips').then(setClips).finally(() => setLoading(false)); }, []);

  const categories = ['all', 'funny', 'emotional', 'controversial', 'opinion', 'story', 'engagement'];
  const shown = filter === 'all' ? clips : clips.filter((c) => c.category === filter);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Generated Clips</h1>
        <p className="text-sm text-muted-foreground">Every AI-detected clip across your projects.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1 text-xs capitalize ${filter === c ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : shown.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Clapperboard className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">No clips yet — upload a video to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <Link key={c.id} href={`/dashboard/projects/${c.video_id}?clip=${c.id}`}>
              <ClipCard clip={c} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
