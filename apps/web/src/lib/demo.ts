/**
 * Demo mode — when NEXT_PUBLIC_DEMO=1, the app renders every dashboard screen
 * with canned sample data and bypasses the auth guard. This is ONLY for design
 * review / screenshots; it changes nothing about the real auth + API path.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

const HOOKS = [
  'Nobody talks about this…',
  'This changed everything for me.',
  'I wish I knew this sooner.',
  'Everyone gets this wrong.',
  'The truth about going viral.',
  'Stop doing this immediately.',
  'Here is what actually works.',
  'This one tip 10x’d my views.',
  'You are leaving money on the table.',
  'Watch this before you post again.',
];

function makeClip(i: number, videoId: string, videoTitle: string) {
  const categories = ['funny', 'emotional', 'controversial', 'opinion', 'story', 'engagement'];
  const category = categories[i % categories.length];
  const start = 45 + i * 120;
  const end = start + 40 + (i % 4) * 10;
  const captionText =
    'this is the exact moment everything changed and honestly nobody saw it coming at all'.split(' ');
  return {
    id: `${videoId}-clip-${i + 1}`,
    video_id: videoId,
    video_title: videoTitle,
    title: [
      'The mistake that cost me everything',
      'Why nobody succeeds at this',
      'The unpopular opinion that went viral',
      'How I turned failure into 1M views',
      'The story that broke the internet',
      'The hook that stops every scroll',
    ][i % 6],
    category,
    start_sec: start,
    end_sec: end,
    virality_score: 96 - i * 4,
    reason: 'Strong emotional payoff with a punchy, quotable line in the first three seconds.',
    transcript_slice: captionText.join(' '),
    caption_style: ['bold-center', 'karaoke-yellow', 'minimal', 'hormozi'][i % 4],
    captions: captionText.map((word, j) => ({ word, start: j * 0.4, end: j * 0.4 + 0.38 })),
    hooks: HOOKS,
    titles: {
      tiktok: 'the moment that changed everything 😳 #storytime',
      shorts: 'This Changed Everything (You Need To See This)',
      reel: 'the unpopular truth nobody tells you 🎯',
    },
    hashtags: {
      trending: ['#fyp', '#viral', '#foryou', '#trending', '#storytime'],
      niche: ['#creatoreconomy', '#contentcreator', '#videoediting', '#podcastclips', '#solopreneur'],
      seo: ['#howtogoviral', '#shortformvideo', '#tiktokgrowth', '#reelstips', '#youtubeshorts'],
    },
    render_status: i < 8 ? 'ready' : 'rendering',
    render_path: i < 8 ? 'demo/render.mp4' : null,
    created_at: new Date(Date.now() - i * 3600_000).toISOString(),
  };
}

const VIDEOS = [
  { id: 'demo-1', title: 'How to Build a $1M Solo Business (Full Podcast)', source: 'upload', status: 'ready', duration_sec: 3820 },
  { id: 'demo-2', title: 'The Future of AI — Interview with a Founder', source: 'youtube', status: 'ready', duration_sec: 2760 },
  { id: 'demo-3', title: 'Weekly Livestream — Q&A + Hot Takes', source: 'upload', status: 'rendering', duration_sec: 5400 },
];

function projectDetail(id: string) {
  const v = VIDEOS.find((x) => x.id === id) ?? VIDEOS[0];
  const clips = Array.from({ length: 10 }, (_, i) => makeClip(i, v.id, v.title));
  return { ...v, user_id: 'demo-user', progress: 100, sourceUrl: null, clips };
}

const ALL_CLIPS = VIDEOS.flatMap((v) =>
  Array.from({ length: v.status === 'ready' ? 10 : 4 }, (_, i) => makeClip(i, v.id, v.title)),
);

/** Returns canned data for a given API path, or undefined if unhandled. */
export function demoResponse(path: string, method = 'GET'): any {
  const clean = path.split('?')[0];

  if (clean === '/analytics/me')
    return {
      videos_processed: 2,
      clips_generated: 24,
      clips_exported: 11,
      videos_this_month: 2,
      top_caption_style: 'karaoke-yellow',
      plan: 'pro',
    };

  if (clean === '/videos' && method === 'GET')
    return VIDEOS.map((v) => ({
      ...v,
      clip_count: v.status === 'ready' ? 10 : 4,
      created_at: new Date(Date.now() - VIDEOS.indexOf(v) * 86_400_000).toISOString(),
    }));

  const projMatch = clean.match(/^\/videos\/([^/]+)$/);
  if (projMatch && method === 'GET') return projectDetail(projMatch[1]);

  if (clean.match(/^\/videos\/[^/]+\/status$/)) return { status: 'ready', progress: 100, error_message: null };

  if (clean === '/clips' && method === 'GET') return ALL_CLIPS;

  if (clean.match(/^\/clips\/[^/]+\/download$/)) return { url: '#demo-download' };

  const clipMatch = clean.match(/^\/clips\/([^/]+)$/);
  if (clipMatch) return makeClip(0, 'demo-1', VIDEOS[0].title);

  if (clean === '/billing/checkout' || clean === '/billing/portal') return { url: '#demo-billing' };

  if (clean === '/admin/overview')
    return { total_users: 1284, pro_users: 317, videos_processed: 4210, clips_generated: 39_880, videos_last_30d: 612 };

  if (clean === '/admin/users')
    return Array.from({ length: 8 }, (_, i) => ({
      id: `u${i}`,
      email: ['alex@studio.co', 'sam@creators.io', 'jordan@media.tv', 'riley@pods.fm', 'casey@clips.co', 'devon@viral.io', 'quinn@shorts.tv', 'noah@reels.co'][i],
      full_name: null,
      role: 'user',
      plan: i % 3 === 0 ? 'pro' : 'free',
      created_at: new Date(Date.now() - i * 86_400_000).toISOString(),
      videos: 12 - i,
      clips: (12 - i) * 10,
    }));

  if (clean === '/admin/uploads')
    return ALL_CLIPS.slice(0, 8).map((c, i) => ({
      id: c.id,
      title: c.video_title,
      status: i % 4 === 0 ? 'rendering' : 'ready',
      source: i % 2 === 0 ? 'upload' : 'youtube',
      created_at: c.created_at,
      email: ['alex@studio.co', 'sam@creators.io', 'jordan@media.tv', 'riley@pods.fm'][i % 4],
    }));

  return undefined;
}
