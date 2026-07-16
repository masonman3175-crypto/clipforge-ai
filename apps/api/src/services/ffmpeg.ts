import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';

// Prefer explicit paths, else the npm-bundled static binaries.
ffmpeg.setFfmpegPath(env.FFMPEG_PATH || (ffmpegStatic as unknown as string));
ffmpeg.setFfprobePath(env.FFPROBE_PATH || ffprobeStatic.path);

// Bundled caption font (Render/minimal Linux has no system fonts, so libass
// would otherwise render captions invisibly). We ship Anton and point at it.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = path.resolve(__dirname, '../../assets/fonts');
const CAPTION_FONT = 'Anton';

/** Absolute path to the bundled caption font (for a deploy sanity check). */
export const captionFontPath = path.join(FONTS_DIR, 'caption.ttf');

/** Escape a path for use inside an ffmpeg filter argument. */
const escFilterPath = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

export interface CaptionToken {
  word: string;
  start: number; // seconds, relative to clip start
  end: number;
}

// Colours are ASS BBGGRR hex (no alpha). `base` = normal words, `highlight` =
// the currently-spoken word.
const CAPTION_STYLES: Record<
  string,
  { fontsize: number; base: string; highlight: string; outline: string; bold: boolean }
> = {
  'bold-center': { fontsize: 92, base: 'FFFFFF', highlight: '00E5FF', outline: '000000', bold: true },
  'karaoke-yellow': { fontsize: 92, base: 'FFFFFF', highlight: '00F0FF', outline: '000000', bold: true },
  minimal: { fontsize: 78, base: 'FFFFFF', highlight: 'FFFFFF', outline: '000000', bold: false },
  hormozi: { fontsize: 100, base: 'FFFFFF', highlight: '00FF00', outline: '000000', bold: true },
};

/** Probe a media file for duration + dimensions. */
export function probe(filePath: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.width && s.height);
      resolve({
        duration: Number(data.format.duration ?? 0),
        width: stream?.width ?? 0,
        height: stream?.height ?? 0,
      });
    });
  });
}

/**
 * Extract a small, transcription-friendly audio track (16kHz mono, low bitrate).
 * This keeps files tiny (~14MB/hour) so long videos fit transcription limits and
 * upload/transcribe fast. `source` may be a local path or an HTTP(S) URL.
 */
export function extractAudio(source: string, outPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(source)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('32k')
      .format('mp3')
      .on('end', () => resolve(outPath))
      .on('error', (err) => reject(new Error(`Audio extract failed: ${err.message}`)))
      .save(outPath);
  });
}

/** Extract a [startSec, startSec+durationSec] slice of audio as 16kHz mono mp3. */
export function extractAudioSegment(
  source: string,
  outPath: string,
  startSec: number,
  durationSec: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(source)
      .seekInput(startSec)
      .duration(durationSec)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioBitrate('32k')
      .format('mp3')
      .on('end', () => resolve(outPath))
      .on('error', (err) => reject(new Error(`Audio segment failed: ${err.message}`)))
      .save(outPath);
  });
}

/**
 * Render a 1080x1920 vertical clip from [start, end] of the source, cropping to
 * a 9:16 center frame and burning in word-by-word animated captions.
 *
 * `source` may be a local path OR a signed HTTP(S) URL — we seek on the INPUT
 * (`seekInput`) so FFmpeg jumps straight to the clip via HTTP range requests
 * instead of downloading/decoding the whole (possibly hours-long) file.
 * `ultrafast` preset keeps it viable on small/free compute.
 */
export async function renderVerticalClip(opts: {
  sourcePath: string;
  outPath: string;
  startSec: number;
  endSec: number;
  captions: CaptionToken[];
  style?: string;
  cropX?: number; // horizontal crop position, 0 (left) … 1 (right); 0.5 = center
}): Promise<string> {
  const { sourcePath, outPath, startSec, endSec, captions } = opts;
  const style = CAPTION_STYLES[opts.style ?? 'bold-center'] ?? CAPTION_STYLES['bold-center'];
  const duration = endSec - startSec;
  const cropX = Math.min(1, Math.max(0, opts.cropX ?? 0.5));

  const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-'));
  const assPath = path.join(workDir, 'captions.ass');
  await writeFile(assPath, buildAss(captions, style), 'utf8');

  const vf = [
    // Scale to cover the 9:16 frame (lanczos = sharper), then crop a 1080-wide
    // window whose horizontal offset the user controls (cropX).
    'scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos',
    `crop=1080:1920:(iw-1080)*${cropX.toFixed(4)}:0`,
    `subtitles='${escFilterPath(assPath)}':fontsdir='${escFilterPath(FONTS_DIR)}'`,
  ].join(',');

  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .seekInput(startSec) // fast input seek (before -i) — key for long sources
      .duration(duration)
      .videoFilters(vf)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast', // much better quality than ultrafast, still fast
        '-crf 19', // lower = higher quality (visually near-lossless)
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 160k',
        '-movflags +faststart',
      ])
      .size('1080x1920')
      .on('end', () => resolve(outPath))
      .on('error', (err) => reject(new Error(`FFmpeg render failed: ${err.message}`)))
      .save(outPath);
  });
}

/** Group word tokens into short phrases (≤ MAX words, split on pauses). */
function chunkWords(caps: CaptionToken[], maxWords = 4, maxGap = 0.6): CaptionToken[][] {
  const chunks: CaptionToken[][] = [];
  let cur: CaptionToken[] = [];
  for (const tok of caps) {
    if (!tok.word || !tok.word.trim()) continue;
    const prev = cur[cur.length - 1];
    if (cur.length >= maxWords || (prev && tok.start - prev.end > maxGap)) {
      if (cur.length) chunks.push(cur);
      cur = [];
    }
    cur.push(tok);
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

const sanitizeWord = (w: string) => w.replace(/[{}\\]/g, '').trim().toUpperCase();

/**
 * Build an ASS subtitle document with the modern viral-caption look: a short
 * phrase (a few words) stays on screen together, and the word currently being
 * spoken is highlighted in an accent colour. This avoids the old one-word,
 * overlapping style.
 */
function buildAss(captions: CaptionToken[], style: (typeof CAPTION_STYLES)[string]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${CAPTION_FONT},${style.fontsize},&H00${style.base},&H00${style.outline},&H90000000,${style.bold ? -1 : 0},7,3,2,90,90,560,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines: string[] = [];
  for (const chunk of chunkWords(captions)) {
    for (let a = 0; a < chunk.length; a++) {
      const start = toAssTime(chunk[a].start);
      const end = toAssTime(a < chunk.length - 1 ? chunk[a + 1].start : chunk[a].end + 0.35);
      // Full phrase shown; the active word is recoloured to the highlight colour.
      const text = chunk
        .map((w, j) => {
          const W = sanitizeWord(w.word);
          return j === a
            ? `{\\c&H${style.highlight}&}${W}{\\c&H${style.base}&}`
            : W;
        })
        .join(' ');
      lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`);
    }
  }

  return `${header}\n${lines.join('\n')}\n`;
}

function toAssTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const secs = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${secs}`;
}

export { CAPTION_STYLES };
