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

/** Escape a path for use inside an ffmpeg filter argument. */
const escFilterPath = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

export interface CaptionToken {
  word: string;
  start: number; // seconds, relative to clip start
  end: number;
}

const CAPTION_STYLES: Record<string, { fontsize: number; primary: string; outline: string; bold: boolean }> = {
  'bold-center': { fontsize: 90, primary: '&H00FFFFFF', outline: '&H00000000', bold: true },
  'karaoke-yellow': { fontsize: 88, primary: '&H0000FFFF', outline: '&H00000000', bold: true },
  minimal: { fontsize: 72, primary: '&H00FFFFFF', outline: '&H80000000', bold: false },
  'hormozi': { fontsize: 96, primary: '&H0000FF00', outline: '&H00000000', bold: true },
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
    // Scale to cover the 9:16 frame, then crop a 1080-wide window whose
    // horizontal offset the user controls (cropX): 0=left, 0.5=center, 1=right.
    'scale=1080:1920:force_original_aspect_ratio=increase',
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
        '-preset ultrafast',
        '-crf 23',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-b:a 128k',
        '-movflags +faststart',
      ])
      .size('1080x1920')
      .on('end', () => resolve(outPath))
      .on('error', (err) => reject(new Error(`FFmpeg render failed: ${err.message}`)))
      .save(outPath);
  });
}

/**
 * Build an ASS subtitle document that reveals one word at a time (karaoke-style
 * pop). Each word gets a Dialogue line with a scale-up \t transform for the
 * "animated caption" effect.
 */
function buildAss(captions: CaptionToken[], style: (typeof CAPTION_STYLES)[string]): string {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${CAPTION_FONT},${style.fontsize},${style.primary},${style.outline},&H80000000,${style.bold ? -1 : 0},6,2,2,60,60,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const lines = captions.map((tok) => {
    const start = toAssTime(tok.start);
    const end = toAssTime(tok.end + 0.15); // small hold after the word ends
    const text = tok.word.replace(/[{}]/g, '').toUpperCase();
    // Pop-in: start at 60% scale, animate to 100% over 120ms.
    const animated = `{\\fscx60\\fscy60\\t(0,120,\\fscx100\\fscy100)}${text}`;
    return `Dialogue: 0,${start},${end},Default,,0,0,0,,${animated}`;
  });

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
