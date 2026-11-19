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
  if (!supabaseUrl || !serviceRoleKey) {
    return reply(503, { error: "server_not_configured" });
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return reply(401, { error: "authentication_required" });
  }

  let body: { objectPath?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  const objectPath = body?.objectPath;
  if (
    typeof objectPath !== "string" ||
    objectPath.length < 3 ||
    objectPath.length > 500 ||
    objectPath.startsWith("/") ||
    objectPath.includes("..") ||
    objectPath.includes("\\")
  ) {
    return reply(400, { error: "invalid_object_path" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return reply(401, { error: "invalid_session" });

  const now = new Date().toISOString();
  const { data: subscriptions, error: subscriptionError } = await admin
    .from("nexora_subscriptions")
    .select("id,status,current_period_end")
    .eq("user_id", userData.user.id)
    .eq("status", "active")
    .gt("current_period_end", now)
    .limit(1);

  if (subscriptionError) return reply(503, { error: "entitlement_check_failed" });
  if (!subscriptions || subscriptions.length === 0) {
    return reply(403, { error: "premium_subscription_required" });
  }

  // Signed URL lifetime is deliberately short. The private bucket must be created
  // by the reviewed migration before this function is deployed.
  const { data: signed, error: signedError } = await admin.storage
    .from("nexora-premium-videos")
    .createSignedUrl(objectPath, 60);

  if (signedError || !signed?.signedUrl) {
    return reply(404, { error: "premium_video_unavailable" });
  }

  return reply(200, {
    signedUrl: signed.signedUrl,
    expiresInSeconds: 60,
  });
});
