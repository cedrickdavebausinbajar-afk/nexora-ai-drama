# NEXORA AI DRAMA — Performance and Store Readiness

## Current automated baseline

- CI runs `npm test`, production Vite build, dependency audit, compressed asset budgets, secret-pattern scan and privileged Edge Function type-checks.
- `performance-monitor.js` emits privacy-minimized startup, navigation, long-task, video waiting/stalled/error, and online/offline metrics to the existing Google Analytics event stream when configured.
- The monitor does not collect video URLs, account IDs, email addresses, playback content, or precise location.
- Automated browser tests cannot establish real-device cold-start time, physical memory pressure, Android decoder behavior, or cellular-network recovery.

## Required physical-device matrix

Record device model, Android version, app version, network type, test date, and results for each row.

| Scenario | Test | Pass criteria |
|---|---|---|
| Cold launch | Force-stop, clear process only, launch 5 times | No stuck splash; shell usable on every run |
| Warm launch | Background and reopen 5 times | No blank screen or duplicate initialization |
| Memory | Browse home, search, details, shorts and player for 15 minutes | No crash, runaway heap growth, or leaked thumbnail object URLs |
| Video | Play, pause, seek, rotate/background/foreground | Playback resumes or gives a clear recoverable error |
| Slow network | Android network throttling / weak cellular | Loading state remains visible; retries work |
| Offline | Disable data during catalogue fetch and video playback; restore | App shell remains usable; catalogue and playback recover after reconnect |
| Episodes | Open series with 1, 2, 10 and 100 episodes | Correct grouping, stable ordering, no missing/duplicate episodes |
| Thumbnails | Scroll quickly through long catalogue | Lazy images load; failed images show fallback; no broken layout |
| Crash reporting | Trigger a controlled test exception in a test build | Event reaches configured backend; no secrets or personal data in payload |

Do not label this matrix passed until results are recorded on actual devices. Keep a low-memory Android device and a current Android device in the test set.

## Store release requirements

The current release workflow can create a signed store AAB only when all four Android signing secrets are configured and the Supabase URL, anon key, and **live** PayMongo public key are present. The AAB step in build #311 was skipped; the APK release is not an AAB substitute.

Before a store bundle is approved:
1. Confirm the release signing keystore is backed up securely and the same signing identity is retained for future updates.
2. Configure production Supabase and live PayMongo values in repository Actions secrets; never commit them.
3. Build the store variant with `VITE_APP_STORE_DISTRIBUTION=true`.
4. Verify package ID `com.nexora.aidrama`, monotonically increasing version code, release signature, AAB contents and absence of `android.permission.REQUEST_INSTALL_PACKAGES`.
5. Test premium purchase status, restore/re-login, expiry, refund/chargeback behavior, ads suppression for active subscribers, and privacy consent in the store variant.

## Listing assets and declarations — draft, owner review required

- App title: NEXORA AI DRAMA
- Short description: Discover and watch short-form drama series.
- Package ID: `com.nexora.aidrama`
- Support/privacy website: use the published NEXORA official website only after its privacy policy page is live and verified.
- Screenshots: capture genuine current app screens on a physical Android device; do not use mockups that imply unavailable features.
- Content rating: complete each store's questionnaire based on actual drama content, user-generated content and interactive features.
- Data safety/privacy declarations: inspect actual SDK behavior and backend flows before declaring collection or sharing. Potential data categories to assess include account identifiers, diagnostics/crash logs, app interactions, device identifiers, purchase/subscription state, and advertising identifiers. Do not declare these as collected unless verified against the production configuration.
- Ads: declare advertising accurately; confirm consent flow and premium ad-free behavior in the store build.
- Payments: disclose recurring weekly/monthly billing, renewal, cancellation, refund and support terms. Store-specific billing requirements must be reviewed before enabling PayMongo checkout in a store-distributed build.

## Submission status

- Signed direct-download APK v1.0.311: published.
- Signed AAB: not produced in build #311 (workflow skipped it).
- Amazon Appstore submission: not submitted.
- Samsung Galaxy Store submission: not submitted.
- Real-device performance matrix: pending physical-device execution.
- Privacy declarations, store screenshots and listing copy: draft only; require owner verification before submission.

## Store-specific verified requirements

- Amazon accepts either an APK or AAB for Fire OS submissions; AAB is optional. The Amazon developer account is free to register. Amazon requires listing image assets and descriptions, a physical-device test, and completion of its privacy questionnaire. See [Amazon submission requirements](https://developer.amazon.com/docs/app-submission/publish-app-login-and-add-app.html), [AAB support](https://developer.amazon.com/docs/app-submission/app-bundles.html), and [privacy labels](https://developer.amazon.com/docs/app-submission/appstore-privacy-labels.html).
- Samsung Galaxy Store accepts APK and AAB. Its Seller Portal documentation says AAB signing must use a signing key managed or uploaded through Seller Portal; when moving an existing APK app to AAB, upload the signing key used by the existing APK. All binaries registered for one app must use the same signing key. Review [Samsung app registration](https://developer.samsung.com/galaxy-store/launch.html) and [AAB/APK upload action details](https://developer.samsung.com/galaxy-store/galaxy-store-developer-api/fastlane-plugin/action/upload-apk.html).
- Do not switch the NEXORA signing key during a store migration. Confirm the current APK signing certificate fingerprint first, then coordinate the same key with each store's signing flow.

Amazon currently permits the existing signed APK route, so a live PayMongo key is not technically required just to upload an APK there. However, the current workflow's store-specific APK/AAB build removes the direct-download installer permission and configures store distribution behavior; it is intentionally gated on production billing configuration to protect subscription/ad behavior. Do not upload the direct-download APK to a store until its permissions and payment behavior have been reviewed.
