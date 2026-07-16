import youtubeDl from 'youtube-dl-exec';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';

/**
 * Download a YouTube video to a local mp4 for processing.
 * Note: only use this for content you have the rights to repurpose.
 * Returns the local file path.
 */
export async function downloadYouTube(url: string): Promise<{ localPath: string; title: string }> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-yt-'));
  const outPath = path.join(workDir, 'source.mp4');

  // Grab metadata first (for the project title).
  const info = (await youtubeDl(url, { dumpSingleJson: true, noWarnings: true })) as any;

  await youtubeDl(url, {
    output: outPath,
    format: 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    mergeOutputFormat: 'mp4',
    noWarnings: true,
  });

  return { localPath: outPath, title: info?.title ?? 'YouTube import' };
}
