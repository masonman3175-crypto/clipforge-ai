import { z } from 'zod';
import { aiClient, AI_MODELS } from './aiClient.js';
import type { TranscriptWord } from './transcription.js';

export type ClipCategory =
  | 'funny'
  | 'emotional'
  | 'controversial'
  | 'opinion'
  | 'story'
  | 'engagement';

export interface DetectedClip {
  title: string;
  category: ClipCategory;
  start_sec: number;
  end_sec: number;
  virality_score: number; // 0..100
  reason: string;
}

// ── Structured-output schemas (we validate what the model returns) ──────────
const clipSchema = z.object({
  title: z.string(),
  category: z.enum(['funny', 'emotional', 'controversial', 'opinion', 'story', 'engagement']),
  start_sec: z.number().nonnegative(),
  end_sec: z.number().positive(),
  virality_score: z.number().min(0).max(100),
  reason: z.string(),
});
const clipsResponse = z.object({ clips: z.array(clipSchema) });

/**
 * Ask the model to find the ~10 most viral-ready moments in the transcript.
 * Each clip is constrained to 30–90s. We pass compact timestamped lines so the
 * model can reference real timecodes.
 */
export async function detectClips(
  fullText: string,
  words: TranscriptWord[],
  targetCount = 10,
): Promise<DetectedClip[]> {
  const timeline = buildTimedTranscript(words);

  const system = [
    'You are a world-class short-form video editor who has produced hundreds of viral',
    'TikToks, Reels, and YouTube Shorts. You find the single most shareable moments in',
    'long-form content. You care about hooks in the first 3 seconds, emotional payoff,',
    'controversy, strong opinions, humor, and satisfying story arcs.',
  ].join(' ');

  const user = [
    `Here is a timestamped transcript (seconds → text):\n\n${timeline}`,
    '',
    `Select the ${targetCount} best standalone clips for short-form video.`,
    'Rules:',
    '- Each clip MUST be between 30 and 90 seconds long (end_sec - start_sec).',
    '- Clips must not overlap.',
    '- start_sec/end_sec must fall within the transcript timeline.',
    '- category ∈ {funny, emotional, controversial, opinion, story, engagement}.',
    '- virality_score is your 0–100 estimate of viral potential.',
    '- reason: one sentence on why this moment will perform.',
    '- title: a punchy internal label (not the caption).',
    'Return JSON: { "clips": [ ... ] }.',
  ].join('\n');

  const completion = await aiClient.chat.completions.create({
    model: AI_MODELS.analysis,
    temperature: 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const parsed = clipsResponse.parse(JSON.parse(completion.choices[0].message.content ?? '{}'));

  // Clamp to the 30–90s rule defensively (models occasionally drift).
  return parsed.clips
    .map((c) => {
      const len = c.end_sec - c.start_sec;
      if (len < 30) c.end_sec = c.start_sec + 30;
      if (len > 90) c.end_sec = c.start_sec + 90;
      return c;
    })
    .slice(0, targetCount);
}

// ── Per-clip creative assets ────────────────────────────────────────────────
// Lenient schema: open models (Llama) may return slightly off counts/shapes,
// so we accept flexible input and normalize below instead of hard-failing.
const strArray = z.array(z.union([z.string(), z.number()]).transform(String)).default([]);
const assetsSchemaLoose = z.object({
  hooks: strArray,
  titles: z
    .object({ tiktok: z.string().optional(), shorts: z.string().optional(), reel: z.string().optional() })
    .default({}),
  hashtags: z
    .object({ trending: strArray, niche: strArray, seo: strArray })
    .default({ trending: [], niche: [], seo: [] }),
});
export interface ClipAssets {
  hooks: string[];
  titles: { tiktok: string; shorts: string; reel: string };
  hashtags: { trending: string[]; niche: string[]; seo: string[] };
}

/** Generate 10 hooks, 3 platform titles, and 3 hashtag buckets for one clip. */
export async function generateClipAssets(clipTranscript: string, category: ClipCategory): Promise<ClipAssets> {
  const user = [
    `Clip category: ${category}`,
    `Clip transcript:\n"""${clipTranscript}"""`,
    '',
    'Produce viral packaging for this clip. Return JSON with exactly:',
    '- hooks: array of EXACTLY 10 scroll-stopping opening lines (≤ 8 words each),',
    '    in the style of "Nobody talks about this...", "This changed everything.",',
    '    "I wish I knew this sooner." Make them specific to the clip content.',
    '- titles: { tiktok, shorts, reel } — one optimized title per platform.',
    '- hashtags: { trending: [...], niche: [...], seo: [...] } — 5 each, no # symbol duplication issues, include the leading #.',
  ].join('\n');

  const completion = await aiClient.chat.completions.create({
    model: AI_MODELS.analysis,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a viral short-form content strategist.' },
      { role: 'user', content: user },
    ],
  });

  const raw = assetsSchemaLoose.parse(JSON.parse(completion.choices[0].message.content ?? '{}'));

  // Normalize to a stable shape: exactly-ish 10 hooks, all title fields present.
  const hooks = raw.hooks.filter(Boolean).slice(0, 10);
  return {
    hooks,
    titles: {
      tiktok: raw.titles.tiktok ?? '',
      shorts: raw.titles.shorts ?? '',
      reel: raw.titles.reel ?? '',
    },
    hashtags: {
      trending: raw.hashtags.trending ?? [],
      niche: raw.hashtags.niche ?? [],
      seo: raw.hashtags.seo ?? [],
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Compact "12.3 word word word" lines, ~1 line per ~5s window, to keep tokens low. */
function buildTimedTranscript(words: TranscriptWord[], windowSec = 5): string {
  if (words.length === 0) return '';
  const lines: string[] = [];
  let windowStart = words[0].start;
  let bucket: string[] = [];
  for (const w of words) {
    if (w.start - windowStart >= windowSec && bucket.length) {
      lines.push(`${windowStart.toFixed(1)} ${bucket.join(' ')}`);
      windowStart = w.start;
      bucket = [];
    }
    bucket.push(w.word);
  }
  if (bucket.length) lines.push(`${windowStart.toFixed(1)} ${bucket.join(' ')}`);
  return lines.join('\n');
}

/** Slice the transcript words that fall inside [start, end] into caption tokens. */
export function buildCaptions(words: TranscriptWord[], start: number, end: number) {
  return words
    .filter((w) => w.start >= start && w.end <= end)
    .map((w) => ({ word: w.word.trim(), start: w.start - start, end: w.end - start }));
}

/** Plain text of a clip's spoken words, for asset generation + display. */
export function sliceTranscriptText(words: TranscriptWord[], start: number, end: number) {
  return words
    .filter((w) => w.start >= start && w.end <= end)
    .map((w) => w.word)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
