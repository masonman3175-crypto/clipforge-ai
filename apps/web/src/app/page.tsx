import Link from 'next/link';
import { Sparkles, Scissors, Captions, Hash, Wand2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  { icon: Wand2, title: 'AI moment detection', body: 'We scan your transcript for funny, emotional, controversial, and high-engagement peaks.' },
  { icon: Scissors, title: '10 clips, automatically', body: 'Every upload becomes ten 30–90s vertical clips, ranked by virality score.' },
  { icon: Captions, title: 'Animated captions', body: 'Word-by-word captions in multiple styles, fully editable before export.' },
  { icon: Hash, title: 'Hooks, titles & hashtags', body: 'Ten viral hooks per clip plus platform-tuned titles and trending hashtags.' },
];

export default function Landing() {
  return (
    <main className="glow-bg">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          ClipForge AI
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/sign-in"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link href="/sign-up"><Button size="sm">Get started</Button></Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 pt-20 pb-16 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> Powered by AI clip detection
        </div>
        <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
          Turn long videos into <span className="text-primary">viral clips</span> automatically
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Upload a podcast, interview, or stream. ClipForge finds the best moments and produces
          ready-to-post TikToks, Reels, and Shorts — captions, hooks, and hashtags included.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">Start free <ArrowRight className="h-4 w-4" /></Button>
          </Link>
          <Link href="/sign-in"><Button size="lg" variant="outline">Sign in</Button></Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Try 1 video free. Get a license key from our Discord for unlimited access.</p>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="pt-6">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ClipForge AI · Built with Next.js, Express, and OpenAI
      </footer>
    </main>
  );
}
