# NEXORA AI DRAMA Premium subscriptions

This change is a **foundation only**. It does not activate payments, add a payment screen, grant premium access, execute migrations, deploy anything, or build an APK.

## Confirmed commercial settings

| Plan ID | Price | Billing interval | Benefits |
|---|---:|---|---|
| `nexora_monthly_99` | PHP 99 | Monthly | Ad-free viewing + exclusive dramas |
| `nexora_weekly_66` | PHP 66 | Every 7 days | Ad-free viewing + exclusive dramas |

The provider must be configured with a calendar-month recurring interval for the monthly plan and a 7-day recurring interval for the weekly plan. Do not implement monthly as a fixed 30-day cycle unless the payment provider explicitly requires that behavior and the owner approves it.

## Files

- `supabase/migrations/202611190001_nexora_subscription_foundation.sql`: plans, customer subscription records, and a minimal webhook event ledger.
- `supabase/migrations/202611190002_nexora_premium_private_storage.sql`: creates a separate private bucket for premium video files.
- This document: deployment and integration guardrails.

## Storage and entitlement security

- The existing `nexora-drama-videos` bucket is public. Do not place premium-only videos there; public objects cannot be protected by hiding UI controls.
- The new `nexora-premium-videos` bucket is private and has owner-only upload/update/delete policies with no client SELECT policy.
- Keep existing public drama playback unchanged. Migrate or upload premium-only media into the private bucket only after the private-storage migration is reviewed and applied to the confirmed Supabase project.
- Premium playback must be authorized by trusted server-side code. After checking the authenticated user's active subscription, the server may issue a short-lived signed URL. Never expose the Supabase service-role key in the APK or browser bundle.
- Authenticated users can read only their own subscription rows. Anyone can read active plan definitions.
- Client roles cannot insert, update, or delete subscription rows. The webhook event ledger has no client-facing grants or policies.
- Payment confirmation and entitlement changes must happen in a trusted server-side function after signature verification.
- Never put payment-provider secret keys or Supabase service-role keys in the APK or browser bundle.
- Do not store raw webhook bodies or card data in the event ledger.
- Treat webhook delivery as at-least-once: enforce uniqueness on provider + event ID and make processing idempotent.

## Required next implementation steps

1. Confirm the production Supabase project and review/apply both migrations there.
2. Confirm the merchant's approved payment provider and enabled recurring methods. PayMongo is only a candidate until the merchant account is approved and recurring billing is enabled.
3. Implement a server-side checkout/session function that accepts only an authenticated user and one of the two allowlisted plan IDs. The server must obtain the price from the database, never from a client-supplied amount.
4. Implement a webhook function that verifies the provider signature against the raw request body, records each event idempotently, validates amount/currency/plan, and updates subscription state only for verified provider events.
5. Implement a server-side premium playback function that checks the active subscription before issuing a short-lived signed URL from the private bucket.
6. Add purchase, restore/status, manage/cancel, renewal-failure, expiry, and refund handling.
7. Add tests for forged webhooks, duplicate events, wrong amounts, wrong currency, expired/cancelled subscriptions, private-object access, and account ownership.
8. Only then integrate the native APK UI and build/release it.

## Important current limitations

The existing app source initializes Supabase from Vite environment variables, but this change does not establish whether the production Supabase project has the required auth settings, whether Edge Functions are deployed, or which video objects are actually premium. The existing public bucket remains public. Verify the production project and classify media before exposing premium content. Do not deploy a payment integration or accept real money until the provider and production configuration are verified.


## PayMongo integration status and webhook contract

PayMongo's current Subscriptions API supports reusable plans with `week` and `month` intervals, but PayMongo must enable Subscriptions for the merchant account before live use. Automated recurring methods currently documented are Maya and cards; do not promise GCash recurring without written provider confirmation.

The initial webhook receiver is at `supabase/functions/paymongo-webhook/index.ts`. It:
- accepts POST only and reads the raw request body before parsing;
- verifies `Paymongo-Signature` using HMAC-SHA256 over `timestamp.rawBody`, selecting `te` for test events and `li` for live events;
- persists the provider event ID with a unique-key idempotency guard and a SHA-256 payload fingerprint;
- returns success for already-recorded duplicate deliveries.

**Important:** this receiver is an event-intake foundation, not a complete payment integration. It does not create PayMongo customers/plans/subscriptions, reconcile invoices, validate the expected ₱66/₱99 amount against a provider invoice, map a verified event to a NEXORA user, or activate/cancel premium entitlements. It intentionally leaves events in `received` state and does not grant access. A separate trusted reconciler and checkout function must be implemented and tested before payments can be accepted.

Configure `PAYMONGO_WEBHOOK_SECRET` as a Supabase Edge Function secret. It is the endpoint signing secret from PayMongo's Webhooks dashboard, not the API secret key. Also configure the Supabase service-role secret only in the Edge Function environment. Never commit or paste either secret into the repository or chat. Register separate test and live webhook endpoints/secrets as appropriate.

PayMongo references:
- Subscriptions API: https://docs.paymongo.com/docs/payment-acceptance-subscriptions
- Webhook setup and signature verification: https://docs.paymongo.com/docs/creating-a-webhook-endpoint
- Webhook events and retries: https://docs.paymongo.com/reference/webhook-resource


### Webhook replay protection and provider events

The webhook receiver also rejects signatures whose timestamp is more than five minutes from server time. This is an additional replay-risk control; the event ID unique constraint remains the duplicate-delivery control. Confirm the configured PayMongo webhook is subscribed to the relevant subscription and invoice events (for example `subscription.updated`, `subscription.past_due`, `subscription.unpaid`, `subscription.invoice.paid`, and `subscription.invoice.payment_failed`). The receiver currently stores verified events without granting access; do not interpret HTTP 200 as a successful subscription activation.

PayMongo documents that subscription activation is account-gated and requires manual enablement. Its documented automatic recurring methods are cards and Maya; payment-method activation alone does not enable subscription billing. Request subscription capability from PayMongo before proceeding to live checkout.


## Server-side checkout initializer (not yet live)

The branch now includes `supabase/functions/paymongo-subscription-checkout/index.ts`. It:
- requires a valid Supabase user Bearer token and uses the authenticated user's email;
- accepts only the two fixed plan IDs and reads the amount/interval from the database;
- requires first name, last name, and phone at checkout;
- uses a server-side PayMongo secret key and environment-specific provider plan IDs;
- creates/reuses a private PayMongo customer mapping, creates the recurring subscription, and checks the returned provider plan, invoice amount, and PHP currency against the selected NEXORA plan;
- returns the first invoice Payment Intent ID and client key for the client-side payment-method flow. It never grants premium access.

Configure these Supabase Edge Function secrets only after PayMongo enables Subscriptions for the merchant:
- `PAYMONGO_SECRET_KEY` (test or live secret key; the function detects its mode from the key prefix)
- `PAYMONGO_WEEKLY_PLAN_ID_TEST` and `PAYMONGO_MONTHLY_PLAN_ID_TEST`
- `PAYMONGO_WEEKLY_PLAN_ID_LIVE` and `PAYMONGO_MONTHLY_PLAN_ID_LIVE`
- existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

Create the four provider plans separately in PayMongo with the exact NEXORA values: PHP 66 / `week` / interval_count 1 and PHP 99 / `month` / interval_count 1. Keep test plan IDs paired with a test secret key and live plan IDs paired with a live secret key. Never put the PayMongo secret key in the APK. The frontend still needs a PayMongo public key and a secure client-side Payment Method + Payment Intent attach flow; do not collect or transmit raw card data to the NEXORA backend.

The endpoint has not been deployed or exercised against a PayMongo merchant account. PayMongo Subscriptions is account-gated, so treat this as integration code only. The webhook reconciler, full client payment flow, cancellation/status UI, automated tests, migration application, APK build, and production deployment remain outstanding.
