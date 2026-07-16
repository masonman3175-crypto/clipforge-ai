'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderOpen, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/misc';
import { timeAgo } from '@/lib/utils';

interface Project {
  id: string;
  title: string;
  status: string;
  source: string;
  clip_count: number;
  created_at: string;
}

const statusVariant: Record<string, any> = {
  ready: 'success', failed: 'warn', queued: 'muted',
  transcribing: 'accent', analyzing: 'accent', rendering: 'accent',
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => api<Project[]>('/videos').then(setProjects).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm('Delete this project and all its clips?')) return;
    await api(`/videos/${id}`, { method: 'DELETE' });
    setProjects((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="text-sm text-muted-foreground">Every video you have uploaded.</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">No projects yet.</p>
          <Link href="/dashboard/upload"><Button>Upload your first video</Button></Link>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <Link href={`/dashboard/projects/${p.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={statusVariant[p.status] ?? 'muted'}>{p.status}</Badge>
                    <span>{p.clip_count} clips</span>
                    <span>· {p.source}</span>
                    <span>· {timeAgo(p.created_at)}</span>
                  </div>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
