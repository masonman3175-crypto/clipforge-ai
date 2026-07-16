import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env.js';
import type { TranscriptWord } from './transcription.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

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

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_ANALYSIS_MODEL,
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
const assetsSchema = z.object({
  hooks: z.array(z.string()).length(10),
  titles: z.object({ tiktok: z.string(), shorts: z.string(), reel: z.string() }),
  hashtags: z.object({
    trending: z.array(z.string()),
    niche: z.array(z.string()),
    seo: z.array(z.string()),
  }),
});
export type ClipAssets = z.infer<typeof assetsSchema>;

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

  const completion = await openai.chat.completions.create({
    model: env.OPENAI_ANALYSIS_MODEL,
    temperature: 0.9,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are a viral short-form content strategist.' },
      { role: 'user', content: user },
    ],
  });

  return assetsSchema.parse(JSON.parse(completion.choices[0].message.content ?? '{}'));
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
