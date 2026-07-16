import { Router, raw } from 'express';
import Stripe from 'stripe';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';
import { query } from '../db/pool.js';
import { env } from '../config/env.js';

const router = Router();
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

/** POST /api/billing/checkout — start a Pro subscription checkout session. */
router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!stripe || !env.STRIPE_PRICE_PRO_MONTHLY) {
      throw new ApiError(503, 'Billing is not configured');
    }
    const user = req.user!;

    // Ensure the user has a Stripe customer.
    let customerId: string | null = (
      await query<{ stripe_customer_id: string | null }>(
        'SELECT stripe_customer_id FROM users WHERE id = $1',
        [user.id],
      )
    ).rows[0]?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $2 WHERE id = $1', [user.id, customerId]);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: env.STRIPE_PRICE_PRO_MONTHLY, quantity: 1 }],
      success_url: `${env.WEB_URL}/dashboard/billing?status=success`,
      cancel_url: `${env.WEB_URL}/dashboard/billing?status=cancelled`,
      metadata: { user_id: user.id },
    });

    res.json({ url: session.url });
  }),
);

/** POST /api/billing/portal — open the Stripe customer portal. */
router.post(
  '/portal',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!stripe) throw new ApiError(503, 'Billing is not configured');
    const { rows } = await query<{ stripe_customer_id: string | null }>(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user!.id],
    );
    const customerId = rows[0]?.stripe_customer_id;
    if (!customerId) throw new ApiError(400, 'No billing account yet');

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${env.WEB_URL}/dashboard/billing`,
    });
    res.json({ url: portal.url });
  }),
);

/**
 * POST /api/billing/webhook — Stripe events (raw body required for signature check).
 * This route is mounted with express.raw() in index.ts BEFORE the JSON parser.
 */
export const webhookHandler = [
  raw({ type: 'application/json' }),
  asyncHandler(async (req: any, res: any) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return res.status(503).end();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        req.headers['stripe-signature'] as string,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      return res.status(400).send(`Webhook signature error: ${(err as Error).message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        await setPlan(s.metadata?.user_id, 'pro', s.subscription as string, s.customer as string);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await query(
          `UPDATE users SET plan = 'free', stripe_subscription_id = NULL WHERE stripe_customer_id = $1`,
          [sub.customer as string],
        );
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const plan = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free';
        await query(`UPDATE users SET plan = $2 WHERE stripe_customer_id = $1`, [
          sub.customer as string,
          plan,
        ]);
        break;
      }
    }
    res.json({ received: true });
  }),
];

async function setPlan(userId: string | undefined, plan: 'free' | 'pro', subId?: string, custId?: string) {
  if (!userId) return;
  await query(
    `UPDATE users SET plan = $2, stripe_subscription_id = $3, stripe_customer_id = COALESCE($4, stripe_customer_id) WHERE id = $1`,
    [userId, plan, subId ?? null, custId ?? null],
  );
}

export default router;
