# NEXORA AI DRAMA — Store Listing Draft (Owner Review Required)

## Core listing

**App name:** NEXORA AI DRAMA

**Package:** `com.nexora.aidrama`

**Short description (draft):** Discover short-form drama series and follow every episode in one place.

**Long description (draft):**

Discover NEXORA AI DRAMA, a mobile destination for short-form drama entertainment. Browse drama series, explore episode collections, and continue watching stories from your library.

Features shown in the current application:
- Browse drama titles and episode collections.
- Search and discover dramas.
- Open drama details and choose available episodes.
- Save dramas and keep track of viewing progress.
- Watch eligible free episodes and access premium content when an active entitlement is available.
- Receive optional app and new-content notifications.
- Manage advertising privacy choices where required.

Some content and features require an internet connection. Availability of premium episodes, subscriptions, advertisements, and notifications may vary by account, region, consent status, and service availability.

## Listing metadata still to be confirmed

- Developer / publisher display name: confirm legal or public-facing publisher name.
- Support email: provide a monitored support address; do not use a personal address without confirming.
- Privacy policy URL: publish and verify a complete privacy policy before submission.
- Website URL: use the official NEXORA site only after the privacy policy page is live.
- Countries / languages: choose only territories and languages actually supported and tested.
- Age/content rating: complete each store's current questionnaire based on actual episode content, depictions, themes, user interaction, and content moderation.
- Pricing: confirm whether the app is free to install and document all subscription prices, billing periods, renewals, cancellation and refund terms.
- Screenshots: capture real current app screens from a physical device. Required views should include home/catalogue, drama details, episode selector, video player, and subscription screen only if each is live and functional. Do not fabricate screens or show unreleased features.
- App icon / promotional art: export from the approved NEXORA brand assets to each store's exact current dimensions and file requirements.

## Privacy / data inventory to verify before store questionnaires

This is an engineering review checklist, not a completed legal declaration.

| Area | Evidence in app/source | Disclosure review |
|---|---|---|
| Account data | Supabase authentication and account-bound premium checks | Determine exact identifiers and profile fields stored |
| App activity | Google Analytics app-open and custom events | Review event names, retention, and sharing |
| Diagnostics | New startup, long-task, memory, network and video playback telemetry | Disclose performance diagnostics if transmitted; confirm analytics property and retention |
| Error reports | Deferred Firebase Functions client error reporting | Verify whether production Firebase secrets configure it and what stack/device fields are stored |
| Advertising | AdMob SDK, consent flow, banner and rewarded-ad integration | Review advertising ID, consent, regional requirements and mediation/SDK disclosures |
| Purchases | PayMongo checkout and subscription status checks | Verify exactly what payment data the app receives versus what PayMongo processes |
| Notifications | Local notifications and periodic background checks | Disclose notification-related data and user controls as applicable |
| User content | Owner-uploaded videos, posters and subtitles | Verify ownership, license, moderation, takedown and storage retention practices |

Before submitting, inspect the production build and the current SDK/provider documentation. Mark each data category as collected/shared only when verified. The performance telemetry added in this codebase sends timing and video playback event metrics to the configured Google Analytics event stream; it does not intentionally send video URLs, account IDs, email addresses, playback content, or precise location.

## Release identity and signing

- Keep package ID `com.nexora.aidrama`.
- Keep version codes strictly increasing.
- Preserve the current release signing identity for updates. Back up the keystore securely and never commit it.
- Store variants must not contain the direct-download installer permission.
- Verify the final APK/AAB manifest, signature certificate fingerprint, permissions and premium/ads behavior before upload.

## Submission state

- Listing copy: draft only.
- Privacy questionnaire: not completed.
- Privacy policy URL: not verified.
- Store screenshots: not supplied or captured.
- Age/content rating: not completed.
- Amazon submission: not submitted.
- Samsung submission: not submitted.
