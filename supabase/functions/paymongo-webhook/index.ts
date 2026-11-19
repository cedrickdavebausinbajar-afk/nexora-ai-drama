// NEXORA AI DRAMA: PayMongo webhook signature verification + idempotent event intake.
// Configure PAYMONGO_WEBHOOK_SECRET, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY
// as Supabase Edge Function secrets. This endpoint records verified events only;
// it deliberately does NOT grant premium access until provider payload mapping,
// amount validation, and subscription reconciliation are implemented and tested.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, paymongo-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseSignature(header: string) {
  const parts: Record<string, string> = {};
  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator > 0) {
      parts[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
    }
  }
  return parts;
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function hmacSha256(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) {
    mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return reply(503, { error: "server_not_configured" });
  }

  const signatureHeader = req.headers.get("Paymongo-Signature");
  if (!signatureHeader) return reply(401, { error: "missing_signature" });

  // Read the untouched body before JSON parsing; PayMongo signs these exact bytes.
  const rawBody = await req.text();
  const signature = parseSignature(signatureHeader);
  if (!signature.t || (!signature.te && !signature.li)) {
    return reply(401, { error: "invalid_signature_header" });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  const attributes = event?.data?.attributes;
  const isLive = attributes?.livemode;
  if (typeof isLive !== "boolean") {
    return reply(400, { error: "missing_livemode" });
  }

  const suppliedSignature = isLive ? signature.li : signature.te;
  if (!suppliedSignature) return reply(401, { error: "missing_mode_signature" });

  const expectedSignature = await hmacSha256(
    webhookSecret,
    `${signature.t}.${rawBody}`,
  );
  if (!constantTimeEqual(expectedSignature, suppliedSignature)) {
    return reply(401, { error: "signature_verification_failed" });
  }

  const eventId = event?.data?.id;
  const eventType = attributes?.type;
  if (
    typeof eventId !== "string" || !eventId.startsWith("evt_") ||
    typeof eventType !== "string" || eventType.length < 3
  ) {
    return reply(400, { error: "invalid_event_envelope" });
  }

  const resource = attributes?.data;
  const resourceAttributes = resource?.attributes ?? {};
  const payloadHash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawBody),
  );

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("nexora_subscription_events").insert({
    provider: "paymongo",
    provider_event_id: eventId,
    event_type: eventType,
    provider_payment_id: typeof resource?.id === "string" ? resource.id : null,
    provider_subscription_id:
      typeof resourceAttributes?.subscription_id === "string"
        ? resourceAttributes.subscription_id
        : null,
    event_status: "received",
    payload_sha256: toHex(payloadHash),
  });

  // A previously received event is an expected PayMongo retry, not a new payment.
  if (error?.code === "23505") return reply(200, { received: true, duplicate: true });
  if (error) return reply(500, { error: "event_persistence_failed" });

  // No subscription is activated here. A separate reconciler must verify the
  // PayMongo subscription/invoice resource, expected plan and amount before granting.
  return reply(200, { received: true, processed: false });
});
