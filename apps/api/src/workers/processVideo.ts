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
import { probe, extractAudio } from '../services/ffmpeg.js';
import { signedUrl } from '../services/storage.js';
import { downloadYouTube } from '../services/youtube.js';
import { aiConfigured } from '../services/aiClient.js';

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
    if (!aiConfigured) {
      throw new Error(
        'AI provider not configured. Set GROQ_API_KEY (free, no card) or a real OPENAI_API_KEY.',
      );
    }
    const video = await getVideo(videoId);

    // 1. Resolve the source. Uploads stream straight from storage via a signed
    //    URL (no multi-GB download to the server's disk); YouTube downloads local.
    const workDir = await mkdtemp(path.join(tmpdir(), 'clipforge-job-'));
    let source: string;

    if (video.source === 'youtube') {
      const dl = await downloadYouTube(video.source_url);
      source = dl.localPath;
      if (video.title === 'Processing…') {
        await query('UPDATE videos SET title = $2 WHERE id = $1', [videoId, dl.title]);
      }
    } else {
      source = await signedUrl(video.storage_path, 3600);
    }

    // 2. Extract a small audio track (ffmpeg reads the URL fine), then read the
    //    duration from that small LOCAL file — probing the remote URL directly
    //    can crash the bundled ffprobe.
    await setStatus(videoId, 'transcribing', 15);
    const audioPath = path.join(workDir, 'audio.mp3');
    await extractAudio(source, audioPath);
    const meta = await probe(audioPath);
    await query('UPDATE videos SET duration_sec = $2 WHERE id = $1', [videoId, meta.duration]);

    const transcript = await transcribe(audioPath, meta.duration);
    await query(
      `INSERT INTO transcripts (video_id, language, text, words)
         VALUES ($1, $2, $3, $4)
       ON CONFLICT (video_id) DO UPDATE
         SET language = EXCLUDED.language, text = EXCLUDED.text, words = EXCLUDED.words`,
      [videoId, transcript.language ?? null, transcript.text, JSON.stringify(transcript.words)],
    );

    // 3. Detect the best clips.
    await setStatus(videoId, 'analyzing', 55);
    const detected = await detectClips(transcript.text, transcript.words, 10);

    // 4. Persist clips + creative assets. Rendering is done ON DEMAND when the
    //    user exports a clip (see routes/clips.ts) — far lighter than rendering
    //    all 10 up front, and it makes long videos feasible on modest compute.
    await setStatus(videoId, 'analyzing', 75);
    for (const clip of detected) {
      const clipText = sliceTranscriptText(transcript.words, clip.start_sec, clip.end_sec);
      const captions = buildCaptions(transcript.words, clip.start_sec, clip.end_sec);
      const assets = await generateClipAssets(clipText || clip.reason, clip.category);
      await insertClip(video.user_id, videoId, clip, clipText, captions, assets);
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
