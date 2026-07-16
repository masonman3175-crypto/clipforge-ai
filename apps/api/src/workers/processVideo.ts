import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { query, withTransaction } from '../db/pool.js';
import { transcribe } from '../services/transcription.js';
import {
  detectClips,
  generateClipAssets,
  buildCaptions,
  sliceTranscriptText,
} from '../services/aiAnalysis.js';
import { renderVerticalClip } from '../services/ffmpeg.js';
import { downloadTo, uploadFile } from '../services/storage.js';
import { downloadYouTube } from '../services/youtube.js';
import { probe } from '../services/ffmpeg.js';

/**
 * End-to-end processing pipeline for a single video, run in the background.
 *
 *   queued → transcribing → analyzing → rendering → ready
 *
 * In production, replace the inline `void process...` call in the route with a
 * real job queue (BullMQ/Redis) and run this in a dedicated worker process.
 * The logic here is queue-agnostic.
 */
export async function processVideo(videoId: string): Promise<void> {
  try {
    const video = await getVideo(videoId);

    // 1. Get a local copy of the source (upload from storage, or YouTube DL).
    const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-'));
    let sourcePath = path.join(workDir, 'source.mp4');

    if (video.source === 'youtube') {
      const dl = await downloadYouTube(video.source_url);
      sourcePath = dl.localPath;
      if (video.title === 'Processing…') {
        await query('UPDATE videos SET title = $2 WHERE id = $1', [videoId, dl.title]);
      }
    } else {
      await downloadTo(video.storage_path, sourcePath);
    }

    const meta = await probe(sourcePath);
    await query('UPDATE videos SET duration_sec = $2 WHERE id = $1', [videoId, meta.duration]);

    // 2. Transcribe.
    await setStatus(videoId, 'transcribing', 15);
    const transcript = await transcribe(sourcePath);
    await query(
      `INSERT INTO transcripts (video_id, language, text, words)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (video_id) DO UPDATE
         SET language = EXCLUDED.language, text = EXCLUDED.text, words = EXCLUDED.words`,
      [videoId, transcript.language ?? null, transcript.text, JSON.stringify(transcript.words)],
    );

    // 3. Detect the best clips.
    await setStatus(videoId, 'analyzing', 45);
    const detected = await detectClips(transcript.text, transcript.words, 10);

    // 4. Persist clips + generate creative assets + render vertical exports.
    await setStatus(videoId, 'rendering', 60);
    let done = 0;
    for (const clip of detected) {
      const clipText = sliceTranscriptText(transcript.words, clip.start_sec, clip.end_sec);
      const captions = buildCaptions(transcript.words, clip.start_sec, clip.end_sec);
      const assets = await generateClipAssets(clipText || clip.reason, clip.category);

      const clipRow = await insertClip(video.user_id, videoId, clip, clipText, captions, assets);

      // Render 1080x1920 export with burned-in captions and upload it.
      try {
        const outPath = path.join(workDir, `${clipRow.id}.mp4`);
        await renderVerticalClip({
          sourcePath,
          outPath,
          startSec: clip.start_sec,
          endSec: clip.end_sec,
          captions,
          style: 'bold-center',
        });
        const key = `renders/${video.user_id}/${videoId}/${clipRow.id}.mp4`;
        await uploadFile(outPath, key, 'video/mp4');
        await query(
          `UPDATE clips SET render_path = $2, render_status = 'ready' WHERE id = $1`,
          [clipRow.id, key],
        );
      } catch (renderErr) {
        console.error(`Render failed for clip ${clipRow.id}:`, renderErr);
        await query(`UPDATE clips SET render_status = 'failed' WHERE id = $1`, [clipRow.id]);
      }

      done += 1;
      await setStatus(videoId, 'rendering', 60 + Math.round((done / detected.length) * 35));
    }

    // 5. Done — record usage for quota + analytics.
    await withTransaction(async (c) => {
      await c.query(`UPDATE videos SET status = 'ready', progress = 100 WHERE id = $1`, [videoId]);
      await c.query(
        `INSERT INTO usage_events (user_id, kind, video_id) VALUES ($1, 'video_processed', $2)`,
        [video.user_id, videoId],
      );
      await c.query(
        `INSERT INTO usage_events (user_id, kind, video_id)
           SELECT $1, 'clip_generated', $2 FROM generate_series(1, $3)`,
        [video.user_id, videoId, detected.length],
      );
    });
  } catch (err) {
    console.error(`processVideo(${videoId}) failed:`, err);
    await query(
      `UPDATE videos SET status = 'failed', error_message = $2 WHERE id = $1`,
      [videoId, err instanceof Error ? err.message : 'Unknown error'],
    );
  }
}

// ── DB helpers ──────────────────────────────────────────────────────────────
interface VideoRow {
  id: string;
  user_id: string;
  title: string;
  source: 'upload' | 'youtube';
  source_url: string;
  storage_path: string;
}

async function getVideo(id: string): Promise<VideoRow> {
  const { rows } = await query<VideoRow>('SELECT * FROM videos WHERE id = $1', [id]);
  if (!rows[0]) throw new Error(`Video ${id} not found`);
  return rows[0];
}

async function setStatus(id: string, status: string, progress: number) {
  await query('UPDATE videos SET status = $2, progress = $3 WHERE id = $1', [id, status, progress]);
}

async function insertClip(
  userId: string,
  videoId: string,
  clip: Awaited<ReturnType<typeof detectClips>>[number],
  clipText: string,
  captions: unknown,
  assets: Awaited<ReturnType<typeof generateClipAssets>>,
) {
  const { rows } = await query<{ id: string }>(
    `INSERT INTO clips
       (video_id, user_id, title, category, start_sec, end_sec, virality_score, reason,
        transcript_slice, captions, hooks, titles, hashtags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      videoId,
      userId,
      clip.title,
      clip.category,
      clip.start_sec,
      clip.end_sec,
      clip.virality_score,
      clip.reason,
      clipText,
      JSON.stringify(captions),
      JSON.stringify(assets.hooks),
      JSON.stringify(assets.titles),
      JSON.stringify(assets.hashtags),
    ],
  );
  return rows[0];
}
