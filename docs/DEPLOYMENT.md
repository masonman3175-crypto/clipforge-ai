# Deployment Guide — ClipForge AI

This guide deploys the three moving parts:

1. **Database + Storage + Auth** → Supabase (managed).
2. **API** (Express + FFmpeg + OpenAI) → Render / Railway / Fly.io.
3. **Web** (Next.js) → Vercel.

---

## 1. Supabase (database, storage, auth)

1. Create a project → note the **Project URL** and keys under **Settings → API**:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the **JWT secret**.
2. **Database → Connection string** → use the *session* pooler URI as `DATABASE_URL`
   (append `?sslmode=require`).
3. **Storage** → new **private** bucket `clipforge-media`.
4. **Authentication → Providers** → enable **Email**. (Optionally disable email confirmation for
   faster testing.)
5. Apply the schema:
   ```bash
   DATABASE_URL="postgresql://…supabase…" npm run db:migrate
   ```

### Row-Level Security (recommended)
The API always scopes queries by `user_id`, but for defense-in-depth add RLS policies so the
`anon`/`authenticated` roles can only read their own rows. The `service_role` key used by the API
bypasses RLS, so the backend keeps working. Example:
```sql
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own videos" ON videos
  FOR SELECT USING (auth.uid() = user_id);
```

---

## 2. API (Render example)

FFmpeg is bundled through `ffmpeg-static`, so no buildpack changes are needed.

1. **New → Web Service**, connect the repo, root directory `apps/api`.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Environment: copy every variable from `.env.example`, using the Supabase production values and
   your real `OPENAI_API_KEY`. Set `NODE_ENV=production` and `WEB_URL=https://your-web.vercel.app`.
5. Deploy → note the service URL, e.g. `https://clipforge-api.onrender.com`.

> **Scaling the pipeline:** `processVideo` currently runs in-process. For production, add Redis and
> BullMQ: enqueue `{ videoId }` from the route, and run a separate **Background Worker** service that
> imports and executes `processVideo`. Both services share the same env and database.

### Stripe webhook
In the Stripe dashboard → **Developers → Webhooks → Add endpoint**:
- URL: `https://clipforge-api.onrender.com/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
- Create a recurring Price for Pro and set `STRIPE_PRICE_PRO_MONTHLY`.

---

## 3. Web (Vercel)

1. **New Project** → import the repo → set **Root Directory** to `apps/web`.
2. Framework preset: **Next.js** (auto-detected).
3. Environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_ANON_KEY=…
   NEXT_PUBLIC_API_URL=https://clipforge-api.onrender.com
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
   NEXT_PUBLIC_ADMIN_EMAILS=you@example.com
   ```
4. Deploy. `next.config.js` rewrites `/api/*` to `NEXT_PUBLIC_API_URL`, so the browser stays
   same-origin and CORS stays simple.

---

## 4. Post-deploy checklist

- [ ] `GET https://your-api/health` returns `{ ok: true }`.
- [ ] Sign up on the web app → confirm a row appears in `users`.
- [ ] Upload a short MP4 → status advances queued → ready; 10 clips appear.
- [ ] Download a clip → 1080×1920 MP4 with burned-in captions.
- [ ] Upgrade with a Stripe **test card** `4242 4242 4242 4242` → plan flips to `pro`.
- [ ] Visit `/admin` from an `ADMIN_EMAILS` account → metrics load.

## 5. Cost & performance notes

- **OpenAI**: Whisper is billed per audio-minute; GPT analysis is one call for detection plus one per
  clip. A 60-min podcast ≈ a few cents to low-single-digit dollars depending on models.
- **Rendering**: CPU-bound. Use `-preset veryfast` (already set) and scale worker concurrency to CPU
  count. For heavy volume, consider GPU FFmpeg or a dedicated transcode service.
- **Storage egress**: served via short-lived signed URLs; enable a CDN in front of Supabase Storage
  for popular exports.
