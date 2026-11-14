# NEXORA AI DRAMA — starter prototype

Separate project identity:
- App name: NEXORA AI DRAMA
- Android package ID: `com.nexora.aidrama`
- Visual theme: black and gold
- Front end: Vite + vanilla JavaScript
- Android wrapper: Capacitor 7

## Android builds
GitHub Actions builds a debug APK on pushes to `main`. If all four release-signing repository secrets are configured, it also builds and uploads a signed release APK as `NEXORA-AI-DRAMA-release`.

Required GitHub Actions secrets:
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

Keep the keystore private and back it up securely. Every future release must use the same keystore and package ID, with a higher version code, for Android in-place updates.

## Run locally
1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run dev` to preview in a browser.
4. Run `npm run build` to create `dist/`.

## Android project
After installing dependencies:
```bash
npx cap add android
npx cap sync android
npx cap open android
```

## Important: prototype limitations
This first version is a UI and interaction prototype. The owner demo PIN is `2468` and is **not secure**. Video entries are stored only in the current browser's local storage and do not sync to other devices. Do not publish this demo admin panel or use it to store sensitive information.

Before public release, connect:
- Supabase Auth with an owner-only account and server-side role checks.
- A Supabase database table for drama metadata and publication status.
- A video host/provider that explicitly permits embedding and in-app playback.
- Server-side validation of video URLs and creator permission records.
- Real Android release signing and privacy/terms pages.

CTTO/credit alone does not grant permission to copy, host, or stream another creator's copyrighted video. Use content with explicit permission, a license, or a provider's permitted embed/API.
