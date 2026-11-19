# NEXORA AI DRAMA — subscription implementation and deployment runbook

## Confirmed plans

| NEXORA plan ID | Customer price | Billing cycle | Included benefits |
|---|---:|---|---|
| `nexora_weekly_66` | PHP 66 | Every 7 days | Ad-free viewing + exclusive dramas |
| `nexora_monthly_99` | PHP 99 | Every calendar month | Ad-free viewing + exclusive dramas |

The NEXORA database stores normalized intervals as `week` and `month`. When creating the corresponding PayMongo scheduled plans, use PayMongo's documented interval values `weekly` and `monthly`, with `interval_count: 1`. Amounts sent to PayMongo are in centavos: PHP 66 = 6600 and PHP 99 = 9900. Do not substitute a fixed 30-day cycle for a calendar-month plan.

## What is in the repository

- `premium-subscriptions.js`: sign-in/sign-up, plan display, subscription status, and card checkout UI.
- `supabase/functions/paymongo-subscription-checkout/index.ts`: authenticated checkout initializer. It allowlists the two plan IDs, reads prices from the database, and does not grant access.
- `supabase/functions/paymongo-webhook/index.ts`: signature verification, event idempotency, provider resource retrieval, and paid-invoice reconciliation.
- `supabase/functions/premium-video-url/index.ts`: server-side active-subscription check and short-lived signed URL issuance. It now accepts a drama ID, resolves the private object path from the published premium catalogue, and never trusts a client-supplied storage path.
- `supabase/migrations/202611190001_nexora_subscription_foundation.sql`: plans, subscriptions, and webhook ledger.
- `supabase/migrations/202611190002_nexora_premium_private_storage.sql`: private premium-video bucket and owner upload policies.
- `supabase/migrations/202611190003_paymongo_checkout_support.sql`: provider mode and customer mapping.
- `supabase/migrations/202611200001_nexora_checkout_attempt_recovery.sql`: durable checkout-attempt UUID and uniqueness protection.
- `supabase/migrations/202611190004_nexora_premium_drama_catalogue.sql`: premium catalogue fields and a database constraint requiring premium episodes to use private storage.
- `src.js`: owner publishing of private premium video files and client playback through the entitlement function.

## Checkout retry and duplicate protection

The client generates one UUID for a checkout attempt and keeps it while retrying that same attempt. The Edge Function requires that UUID and passes a stable, mode-scoped PayMongo idempotency key to subscription creation. Customer creation also uses a stable per-user/per-mode idempotency key. Each card retry receives a new key for PaymentMethod creation and PaymentIntent attachment, so a declined card can be replaced without replaying the prior card attempt. If the first invoice fails while PayMongo still reports the subscription as `incomplete`, the webhook keeps the local row `pending` so the same first-payment attempt remains retryable. A later-cycle `past_due` subscription remains paused while PayMongo performs its documented automatic retries; `unpaid` becomes locally expired, and `incomplete_cancelled` becomes cancelled so a fresh checkout attempt can be started. The server reserves the checkout attempt in `nexora_subscriptions` before creating the provider subscription, and records the resulting provider subscription ID. A retry with the same UUID retrieves that same provider subscription and its first-invoice PaymentIntent; a different attempt is blocked while another pending/active/past-due subscription exists. The database unique indexes prevent duplicate reservations for the same user/provider environment/attempt and enforce at most one pending/active/past-due subscription per user/provider environment, including concurrent requests with different attempt IDs. The migration intentionally stops if pre-existing duplicate open subscriptions need manual reconciliation. PayMongo retains idempotency results for a limited window (currently documented as 24 hours); this is duplicate-request protection, not a substitute for local database reconciliation or payment verification. A reservation whose provider call timed out is retried using the same provider idempotency key.

## Premium-content protection

Premium-exclusive episodes must be uploaded as files through the owner dashboard and marked **Premium-exclusive**. The file is stored in `nexora-premium-videos`, and its path is recorded in `dramas.premium_video_storage_path`. The public `video_url` and `video_storage_path` fields remain empty for those rows. Direct external video URLs cannot be marked premium because NEXORA cannot enforce private access to a third-party public URL.

The app requests playback using the drama ID. The Edge Function checks that the published drama is marked premium, obtains its private path from the database, verifies the user's active subscription and unexpired period, then issues a signed URL valid for 60 seconds. Never put premium-only files in the existing public `nexora-drama-videos` bucket.

The app currently has no ad-serving SDK or ad-placement implementation in this repository. Therefore the ad-free benefit has no separate ad system to suppress yet; do not describe ad-free entitlement enforcement as tested until ads are introduced and every ad placement checks the active entitlement.

## Deployment sequence — not performed by a GitHub merge

1. Confirm the exact Supabase project used by the production APK.
2. Review and apply migrations `202611190001` through `202611190004`, then `202611200001_nexora_checkout_attempt_recovery.sql` in order.
3. Deploy these Edge Functions: `paymongo-subscription-checkout`, `paymongo-webhook`, and `premium-video-url`.
4. In Supabase Edge Function secrets, configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, and the matching weekly/monthly PayMongo plan IDs for the same environment.
5. In GitHub Actions repository secrets, configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYMONGO_PUBLIC_KEY`, and `VITE_NEXORA_PAYMENT_RETURN_URL`. The return URL must be HTTPS. Only the PayMongo public key belongs in the client build; never place a secret key in a Vite variable or APK.
6. Ask PayMongo to enable Subscriptions for the merchant account before attempting test transactions. PayMongo documents cards and Maya for scheduled recurring subscriptions; this client currently implements card checkout only.
7. Register the webhook endpoint and subscribe to `subscription.activated`, `subscription.past_due`, `subscription.unpaid`, `subscription.updated`, `subscription.invoice.paid`, and `subscription.invoice.payment_failed`. Use matching test/live API and webhook secrets.
8. Upload a test premium episode using the owner dashboard and verify that it is not reachable from the public bucket or public video URL.

## Required test-mode acceptance checks

- Create a test weekly subscription at PHP 66 / weekly / interval count 1.
- Create a test monthly subscription at PHP 99 / monthly / interval count 1.
- Complete the first card payment and verify the webhook retrieves the invoice and confirms the exact amount, PHP currency, customer, plan, and mode before activating access.
- Verify a valid subscriber can play a premium episode and receives only a short-lived signed URL.
- Verify signed-out, pending, past-due, unpaid, cancelled, and expired users cannot obtain a premium URL.
- Replay the same webhook event and verify it does not duplicate or corrupt subscription state.
- Test wrong amount, wrong currency, wrong plan, wrong customer, invalid signature, stale signature, and test/live mode mismatch.
- Verify a paid invoice cannot be downgraded by a late payment-failed event.
- Verify public/free dramas still play through the existing public path.
- Rebuild and install the APK from the validated commit; test checkout and the 3DS return path on an Android device.

## Remaining limitations and release gates

- Merging source code does not apply Supabase migrations or deploy Edge Functions.
- No live Supabase migration/deployment or PayMongo merchant transaction is confirmed by repository state alone.
- The owner must classify and upload actual exclusive episodes into the private bucket before there is premium catalogue content to protect.
- The client currently implements card checkout; cancellation/payment-method management, refunds/chargebacks, grace-period policy, and automatic refresh after returning from 3DS still need product and test coverage.
- Ad-free entitlement is not separately implemented because the repository currently contains no ad-serving placements.
- A successful web build or Android artifact build is not proof of payment processing, database deployment, installed-device behavior, or production readiness.

Never commit provider secrets, Supabase service-role keys, card data, or raw webhook payloads.
