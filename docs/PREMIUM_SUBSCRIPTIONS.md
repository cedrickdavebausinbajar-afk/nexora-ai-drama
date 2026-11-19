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
