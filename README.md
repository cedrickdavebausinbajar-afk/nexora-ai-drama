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

## Secure owner dashboard and shared drama library

The Owner Dashboard uses Supabase Auth plus a server-side owner allowlist and Row Level Security (RLS). Owner credentials are never stored in the app. Public app users can read published drama records; only an explicitly allowlisted owner can publish or remove content.

### One-time Supabase setup
1. Create a Supabase project.
2. In the SQL Editor, run `supabase/migrations/202611160001_secure_owner_library.sql`, then `supabase/migrations/202611170001_nexora_video_storage.sql`, then `supabase/migrations/202611170002_drama_watch_counts.sql`, then `supabase/migrations/202611170003_drama_subtitles.sql`.
3. In Supabase Authentication, create the owner's account using your own email and a strong password.
4. Copy that user's UUID from Authentication → Users, then run the INSERT statement at the bottom of the migration to add that UUID to `public.nexora_owner_users`.
5. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build environment. For GitHub Actions, add them as repository Actions secrets with those exact names. The anon/publishable key is intended for client apps; RLS is the security boundary. Never put a service-role key in the app.
6. Rebuild and install the APK. The same variables must be set for any web deployment.

The owner dashboard remains unavailable until the Supabase project and owner allowlist are configured. The subtitle migration adds optional WebVTT subtitle metadata and stored poster-path tracking; run it before publishing new subtitle tracks or using the existing-thumbnail repair action. Existing local-only entries are not automatically uploaded; review and import them manually only if you still have the required video rights.

CTTO/credit alone does not grant permission to copy, host, or stream another creator's copyrighted video. Use content with explicit permission, a license, or a provider's permitted embed/API.

CTTO/credit alone does not grant permission to copy, host, or stream another creator's copyrighted video. Use content with explicit permission, a license, or a provider's permitted embed/API.
