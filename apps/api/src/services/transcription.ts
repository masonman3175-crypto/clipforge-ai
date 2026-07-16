import { createReadStream } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { aiClient, AI_MODELS } from './aiClient.js';
import { extractAudioSegment } from './ffmpeg.js';

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

// Transcription providers cap file size; 16kHz mono mp3 is ~14MB/hour, so a
// 10-minute chunk stays comfortably small. Long audio is split and re-joined.
const CHUNK_SEC = 600;

/**
 * Transcribe an audio file with word-level timestamps. For long audio the file
 * is split into ~10-minute chunks, each transcribed, and the word timestamps are
 * offset back to absolute time and merged — so 1–2 hour videos work fine.
 */
export async function transcribe(audioPath: string, durationSec = 0): Promise<TranscriptResult> {
  if (durationSec <= CHUNK_SEC) {
    return transcribeFile(audioPath, 0);
  }

  const chunks = Math.ceil(durationSec / CHUNK_SEC);
  const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-tr-'));
  const parts: TranscriptResult[] = [];

  for (let i = 0; i < chunks; i++) {
    const startSec = i * CHUNK_SEC;
    const chunkPath = path.join(workDir, `chunk-${i}.mp3`);
    await extractAudioSegment(audioPath, chunkPath, startSec, CHUNK_SEC);
    parts.push(await transcribeFile(chunkPath, startSec));
  }

  return {
    language: parts[0]?.language,
    text: parts.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim(),
    words: parts.flatMap((p) => p.words),
  };
}

/** Transcribe a single (small) audio file, offsetting word times by `offsetSec`. */
async function transcribeFile(audioPath: string, offsetSec: number): Promise<TranscriptResult> {
  const res = await aiClient.audio.transcriptions.create({
    file: createReadStream(audioPath) as any,
    model: AI_MODELS.transcribe,
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  const raw = res as unknown as {
    language?: string;
    text: string;
    words?: { word: string; start: number; end: number }[];
  };

  return {
    language: raw.language,
    text: raw.text,
    words: (raw.words ?? []).map((w) => ({
      word: w.word,
      start: w.start + offsetSec,
      end: w.end + offsetSec,
    })),
  };
}
