import { createReadStream } from 'node:fs';
import { aiClient, AI_MODELS } from './aiClient.js';

export interface TranscriptWord {
  word: string;
  start: number; // seconds
  end: number;
}

export interface TranscriptResult {
  language?: string;
  text: string;
  words: TranscriptWord[];
}

/**
 * Transcribe an audio/video file with Whisper, requesting word-level
 * timestamps so we can render word-by-word animated captions later.
 */
export async function transcribe(localMediaPath: string): Promise<TranscriptResult> {
  const res = await aiClient.audio.transcriptions.create({
    file: createReadStream(localMediaPath) as any,
    model: AI_MODELS.transcribe,
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  // The verbose_json response includes `words` when granularity is requested.
  const raw = res as unknown as {
    language?: string;
    text: string;
    words?: { word: string; start: number; end: number }[];
  };

  return {
    language: raw.language,
    text: raw.text,
    words: (raw.words ?? []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
  };
}
