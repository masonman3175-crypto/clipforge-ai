import { Flame } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/misc';
import { formatDuration } from '@/lib/utils';

const categoryColor: Record<string, string> = {
  funny: 'default', emotional: 'accent', controversial: 'warn',
  opinion: 'default', story: 'accent', engagement: 'success',
};

export function ClipCard({ clip }: { clip: any }) {
  return (
    <Card className="h-full transition-colors hover:border-primary/50">
      <CardContent className="pt-6">
        {/* 9:16 preview placeholder */}
        <div className="relative mb-3 flex aspect-[9/16] max-h-64 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-primary/20 to-accent/10">
          <span className="text-4xl font-black text-white/80">{clip.virality_score}</span>
          <span className="absolute right-2 top-2 rounded bg-black/50 px-1.5 py-0.5 text-xs text-white">
            {formatDuration(clip.end_sec - clip.start_sec)}
          </span>
          {clip.render_status !== 'ready' && (
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-amber-300">
              rendering…
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={(categoryColor[clip.category] as any) ?? 'muted'}>{clip.category}</Badge>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="h-3 w-3 text-orange-400" /> {clip.virality_score}
          </span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-sm font-medium">{clip.title}</h3>
        {clip.video_title && <p className="mt-1 truncate text-xs text-muted-foreground">{clip.video_title}</p>}
      </CardContent>
    </Card>
  );
}
