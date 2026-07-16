import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import videosRouter from './routes/videos.js';
import clipsRouter from './routes/clips.js';
import billingRouter, { webhookHandler } from './routes/billing.js';
import adminRouter from './routes/admin.js';
import analyticsRouter from './routes/analytics.js';

const app = express();

app.use(cors({ origin: env.WEB_URL, credentials: true }));

// Stripe webhook needs the RAW body for signature verification, so it must be
// registered BEFORE express.json() parses everything else.
app.post('/api/billing/webhook', ...webhookHandler);

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) =>
  res.json({
    ok: true,
    service: 'clipforge-api',
    // Non-secret config presence flags, for diagnosing setup.
    config: {
      stripeKey: !!env.STRIPE_SECRET_KEY,
      stripePrice: !!env.STRIPE_PRICE_PRO_MONTHLY,
      stripeWebhook: !!env.STRIPE_WEBHOOK_SECRET,
      webUrl: env.WEB_URL,
      openaiReal: !!env.OPENAI_API_KEY && env.OPENAI_API_KEY.startsWith('sk-'),
      supabaseUrl: env.SUPABASE_URL,
      serviceKeyLen: (env.SUPABASE_SERVICE_ROLE_KEY || '').length,
      serviceKeyCleanLen: (env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/[^\x21-\x7E]/g, '').length,
      serviceKeyPrefix: (env.SUPABASE_SERVICE_ROLE_KEY || '').slice(0, 4),
    },
  }),
);

app.use('/api/videos', videosRouter);
app.use('/api/clips', clipsRouter);
app.use('/api/billing', billingRouter);
app.use('/api/admin', adminRouter);
app.use('/api/analytics', analyticsRouter);

app.use(errorHandler);

app.listen(env.API_PORT, () => {
  console.log(`🚀 ClipForge API listening on http://localhost:${env.API_PORT}`);
});
