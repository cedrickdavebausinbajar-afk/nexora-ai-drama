// NEXORA AI DRAMA: premium video entitlement gate.
// Deploy as a Supabase Edge Function after applying the subscription and private-storage
// migrations. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY as Edge Function secrets.
// Never place the service-role key in the APK or browser bundle.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paymongoSecret = Deno.env.get("PAYMONGO_SECRET_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return reply(503, { error: "server_not_configured" });
  }
  // Rewarded episode entitlements must work independently of PayMongo.
  // When billing is configured, also recognize active paid subscriptions.
  const providerMode = paymongoSecret.startsWith("sk_live_") ? "live" :
    paymongoSecret.startsWith("sk_test_") ? "test" : null;
  if (paymongoSecret && !providerMode) {
    return reply(503, { error: "invalid_payment_provider_configuration" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "authentication_required" });
  }

  let body: { dramaId?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  const dramaId = body?.dramaId;
  if (
    typeof dramaId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dramaId)
  ) {
    return reply(400, { error: "invalid_drama_id" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "invalid_session" });

  // Resolve the private object path from the trusted catalogue. Never accept
  // arbitrary storage paths from the client, even from an active subscriber.
  const { data: drama, error: dramaError } = await admin
    .from("dramas")
    .select("id,is_premium,premium_video_storage_path,published")
    .eq("id", dramaId)
    .eq("published", true)
    .eq("is_premium", true)
    .maybeSingle();

  if (dramaError) return reply(503, { error: "premium_catalogue_check_failed" });
  if (!drama || typeof drama.premium_video_storage_path !== "string" ||
      !drama.premium_video_storage_path.trim()) {
    return reply(404, { error: "premium_video_unavailable" });
  }

  let hasSubscription = false;
  if (providerMode) {
    const now = new Date().toISOString();
    const { data: subscriptions, error: subscriptionError } = await admin
      .from("nexora_subscriptions")
      .select("id,status,current_period_end")
      .eq("user_id", userData.user.id)
      .eq("provider", "paymongo")
      .eq("provider_mode", providerMode)
      .eq("status", "active")
      .gt("current_period_end", now)
      .limit(1);

    if (subscriptionError) return reply(503, { error: "entitlement_check_failed" });
    hasSubscription = Boolean(subscriptions && subscriptions.length > 0);
  }
  if (!hasSubscription) {
    const { data: episodeEntitlement, error: episodeEntitlementError } = await admin
      .from("nexora_episode_entitlements")
      .select("id")
      .eq("user_id", userData.user.id)
      .eq("drama_id", dramaId)
      .maybeSingle();
    if (episodeEntitlementError) return reply(503, { error: "entitlement_check_failed" });
    if (!episodeEntitlement) return reply(403, { error: "premium_subscription_or_reward_required" });
  }

  // Signed URL lifetime is deliberately short. The private bucket must be created
  // by the reviewed migration before this function is deployed.
  const { data: signed, error: signedError } = await admin.storage
    .from("nexora-premium-videos")
    .createSignedUrl(drama.premium_video_storage_path, 3600);

  if (signedError || !signed?.signedUrl) {
    return reply(404, { error: "premium_video_unavailable" });
  }

  return reply(200, {
    signedUrl: signed.signedUrl,
    expiresInSeconds: 3600,
  });
});
