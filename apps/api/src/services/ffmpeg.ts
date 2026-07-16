import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { env } from '../config/env.js';

// Prefer explicit paths, else the npm-bundled static binaries.
ffmpeg.setFfmpegPath(env.FFMPEG_PATH || (ffmpegStatic as unknown as string));
ffmpeg.setFfprobePath(env.FFPROBE_PATH || ffprobeStatic.path);

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
 * Render a 1080x1920 vertical clip from [start, end] of the source, cropping to
 * a 9:16 center frame and burning in word-by-word animated captions via an ASS
 * subtitle file. Returns the output path.
 */
export async function renderVerticalClip(opts: {
  sourcePath: string;
  outPath: string;
  startSec: number;
  endSec: number;
  captions: CaptionToken[];
  style?: string;
}): Promise<string> {
  const { sourcePath, outPath, startSec, endSec, captions } = opts;
  const style = CAPTION_STYLES[opts.style ?? 'bold-center'] ?? CAPTION_STYLES['bold-center'];
  const duration = endSec - startSec;

  const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-'));
  const assPath = path.join(workDir, 'captions.ass');
  await writeFile(assPath, buildAss(captions, style), 'utf8');

  // Scale to cover 1080x1920 then center-crop → true vertical without letterboxing.
  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    `subtitles='${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}'`,
  ].join(',');

  return new Promise((resolve, reject) => {
    ffmpeg(sourcePath)
      .setStartTime(startSec)
      .setDuration(duration)
      .videoFilters(vf)
      .outputOptions([
        '-c:v libx264',
        '-preset veryfast',
        '-crf 20',
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
Style: Default,Arial,${style.fontsize},${style.primary},${style.outline},&H80000000,${style.bold ? -1 : 0},6,2,2,60,60,520,1

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
