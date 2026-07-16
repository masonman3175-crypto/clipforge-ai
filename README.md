# ClipForge AI 🎬✨

Turn long-form videos into viral-ready **TikToks, Instagram Reels, and YouTube Shorts** — automatically.

Upload a podcast, interview, or stream → ClipForge transcribes it, uses AI to find the ten most
engaging moments, cuts them into vertical 1080×1920 clips with animated word-by-word captions, and
generates viral hooks, platform titles, and hashtags for each one.

---

## Table of contents
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [The processing pipeline](#the-processing-pipeline)
- [API reference](#api-reference)
- [Deployment](#deployment)
- [Security notes](#security-notes)
- [Status & roadmap](#status--roadmap)

---

## Architecture

```
┌────────────┐    Bearer JWT     ┌──────────────┐        ┌──────────────┐
│  Next.js   │ ───────────────▶  │  Express API │ ─────▶ │  PostgreSQL  │
│  (web)     │  /api/* (rewrite) │  (api)       │        └──────────────┘
└─────┬──────┘                   └──────┬───────┘
      │ Supabase Auth                   │
      │                                 ├─▶ OpenAI  (Whisper + GPT analysis)
      │                                 ├─▶ FFmpeg  (vertical render + captions)
      │                                 └─▶ Supabase Storage (sources + renders)
      ▼
  Supabase Auth (email/password sessions)
```

The browser talks only to same-origin `/api/*`, which Next.js rewrites to the Express backend. Every
request carries the Supabase access token as a `Bearer` header; the API verifies it with the Supabase
JWT secret and mirrors the user into its own `users` table.

## Tech stack

| Layer            | Choice                                             |
|------------------|----------------------------------------------------|
| Frontend         | Next.js 14 (App Router), TypeScript, Tailwind, shadcn-style UI |
| Backend          | Node.js, Express, TypeScript                        |
| Database         | PostgreSQL 16                                       |
| Auth             | Supabase Auth (email/password)                      |
| Storage          | Supabase Storage                                    |
| Transcription/AI | OpenAI Whisper + GPT (`gpt-4o-mini` by default)     |
| Video processing | FFmpeg (via `fluent-ffmpeg` + bundled static binaries) |
| Billing          | Stripe (subscriptions, test mode)                   |

## Repository layout

```
clipforge-ai/
├── apps/
│   ├── web/                 # Next.js dashboard + marketing site
│   │   └── src/
│   │       ├── app/         # routes: /, (auth), /dashboard/*, /admin
│   │       ├── components/  # ui/, dashboard/, clips/
│   │       └── lib/         # supabase client, api fetch wrapper, utils
│   └── api/                 # Express backend
│       └── src/
│           ├── config/      # env validation (zod)
│           ├── db/          # pg pool + migration runner
│           ├── middleware/  # auth, quota, error handling
│           ├── routes/      # videos, clips, billing, admin, analytics
│           ├── services/    # transcription, aiAnalysis, ffmpeg, storage, youtube
│           └── workers/     # processVideo pipeline
├── packages/db/migrations/  # SQL schema (source of truth)
├── docker-compose.yml       # local Postgres
├── .env.example             # backend env template
└── docs/                    # deployment + architecture notes
```

## Local development

**Prerequisites:** Node 20+, Docker (for Postgres) or a Supabase project, and API keys for OpenAI /
Supabase (Stripe optional).

```bash
# 1. Install all workspaces
npm install

# 2. Start Postgres and apply the schema
docker compose up -d postgres      # or point DATABASE_URL at Supabase
cp .env.example .env               # fill in your keys
npm run db:migrate                 # applies packages/db/migrations/*.sql

# 3. Configure the frontend
cp apps/web/.env.local.example apps/web/.env.local   # fill in NEXT_PUBLIC_* keys

# 4. Run web + api together
npm run dev
#   web → http://localhost:3000
#   api → http://localhost:4000
```

> **FFmpeg** is bundled via `ffmpeg-static`/`ffprobe-static`, so no system install is required.
> Set `FFMPEG_PATH`/`FFPROBE_PATH` to override with a system binary.

### Supabase setup (5 minutes)
1. Create a project at supabase.com.
2. **Storage** → create a **private** bucket named `clipforge-media`.
3. **Settings → API** → copy the URL, `anon` key, `service_role` key, and the **JWT secret**.
4. **Authentication → Providers** → enable Email.
5. Paste those into `.env` and `apps/web/.env.local`.

## Environment variables

See [`.env.example`](.env.example) (backend) and [`apps/web/.env.local.example`](apps/web/.env.local.example)
(frontend) for the full annotated list. The API validates all of them on boot and refuses to start if
anything required is missing.

## The processing pipeline

`apps/api/src/workers/processVideo.ts` runs the whole flow for one video:

```
queued → transcribing → analyzing → rendering → ready
```

1. **Ingest** — download the uploaded file from Supabase Storage, or pull the YouTube video.
2. **Transcribe** — Whisper with word-level timestamps.
3. **Analyze** — GPT selects the 10 best 30–90s moments (category + virality score + reason).
4. **Assets** — per clip: 10 viral hooks, TikTok/Shorts/Reel titles, and trending/niche/SEO hashtags.
5. **Render** — FFmpeg crops to 9:16, burns in animated word-by-word captions (ASS subtitles), and
   exports 1080×1920 H.264, uploaded back to Storage.
6. **Record** — usage events power the Free-plan quota and analytics.

> The route calls the pipeline fire-and-forget for simplicity. For production scale, move
> `processVideo` behind a real queue (BullMQ + Redis) and run dedicated worker processes — the
> function is already queue-agnostic. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## API reference

| Method | Route                          | Purpose                                  |
|--------|--------------------------------|------------------------------------------|
| POST   | `/api/videos`                  | Upload MP4/MOV, start processing         |
| POST   | `/api/videos/youtube`          | Import from a YouTube URL                |
| GET    | `/api/videos`                  | List the user's projects                 |
| GET    | `/api/videos/:id`              | Project + clips + signed source URL      |
| GET    | `/api/videos/:id/status`       | Poll processing status/progress          |
| DELETE | `/api/videos/:id`              | Delete a project (cascades to clips)     |
| GET    | `/api/clips`                   | All clips for the user                   |
| GET    | `/api/clips/:id`               | One clip + signed preview URL            |
| PATCH  | `/api/clips/:id`               | Edit title / captions / style / trim     |
| GET    | `/api/clips/:id/download`      | Signed export URL (records usage)        |
| POST   | `/api/billing/checkout`        | Start Stripe Pro checkout                |
| POST   | `/api/billing/portal`          | Open Stripe customer portal              |
| POST   | `/api/billing/webhook`         | Stripe events (raw body)                 |
| GET    | `/api/analytics/me`            | Personal dashboard metrics               |
| GET    | `/api/admin/overview`          | Platform metrics (admin)                 |
| GET    | `/api/admin/users`             | User list (admin)                        |
| GET    | `/api/admin/uploads`           | Recent uploads (admin)                   |

All routes except the Stripe webhook require `Authorization: Bearer <supabase-access-token>`.

## Deployment

Full guide in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Summary:
- **web** → Vercel (set `NEXT_PUBLIC_*` env vars, point `NEXT_PUBLIC_API_URL` at the API).
- **api** → Render / Railway / Fly.io as a Node service (needs FFmpeg — bundled binaries work).
- **db + storage + auth** → Supabase (managed Postgres connection string in `DATABASE_URL`).
- **Stripe** → add the webhook endpoint `https://your-api/api/billing/webhook`.

## Security notes

- The `service_role` Supabase key and OpenAI/Stripe secrets live **only** in the API, never shipped
  to the browser.
- Storage buckets are **private**; the frontend only ever receives short-lived signed URLs.
- Admin access is gated server-side by `ADMIN_EMAILS`; the nav link is a cosmetic hint only.
- Stripe webhooks verify the signature against the raw request body.
- Free-plan quota is enforced in middleware against `usage_events`, not client state.

## Status & roadmap

This repository is a **complete, coherent scaffold**: every layer has real, wired code. To take it to
production you'll want to:

- [ ] Move `processVideo` onto BullMQ/Redis with retry + concurrency limits.
- [ ] Add Supabase Row-Level Security policies (the API already scopes by `user_id`).
- [ ] Add integration tests around the pipeline and billing webhooks.
- [ ] Add a watermark for Free-plan exports and premium caption styles for Pro.
- [ ] Rate-limit uploads and add virus / file-type scanning on ingest.

See `docs/` for architecture and deployment detail.

---

_ClipForge AI — built with Next.js, Express, PostgreSQL, FFmpeg, and OpenAI._
