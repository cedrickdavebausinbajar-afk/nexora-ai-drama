// NEXORA AI DRAMA: verified PayMongo subscription webhook reconciler.
// Only verified paid invoices can activate/renew premium access.
// Configure PAYMONGO_WEBHOOK_SECRET, PAYMONGO_SECRET_KEY,
// SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY as Edge Function secrets.

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

async function getPayMongoResource(path: string, secret: string) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${btoa(secret + ":")}`,
      "Accept": "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.attributes) {
    throw new Error("provider_resource_unavailable");
  }
  return payload.data;
}

function toIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const webhookSecret = Deno.env.get("PAYMONGO_WEBHOOK_SECRET");
  const paymongoSecret = Deno.env.get("PAYMONGO_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!webhookSecret || !paymongoSecret || !supabaseUrl || !serviceRoleKey) {
    return reply(503, { error: "server_not_configured" });
  }

  const mode = paymongoSecret.startsWith("sk_live_") ? "live" :
    paymongoSecret.startsWith("sk_test_") ? "test" : null;
  if (!mode) return reply(503, { error: "invalid_payment_provider_configuration" });

  const signatureHeader = req.headers.get("Paymongo-Signature");
  if (!signatureHeader) return reply(401, { error: "missing_signature" });

  const rawBody = await req.text();
  const signature = parseSignature(signatureHeader);
  if (!signature.t || !/^\d+$/.test(signature.t) || (!signature.te && !signature.li)) {
    return reply(401, { error: "invalid_signature_header" });
  }

  const signatureTime = Number(signature.t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(signatureTime) || Math.abs(nowSeconds - signatureTime) > 300) {
    return reply(401, { error: "stale_signature" });
  }

  let event: Record<string, any>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  const eventAttributes = event?.data?.attributes;
  const isLive = eventAttributes?.livemode;
  if (typeof isLive !== "boolean" || isLive !== (mode === "live")) {
    return reply(401, { error: "payment_mode_mismatch" });
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
  const eventType = eventAttributes?.type;
  const resource = eventAttributes?.data;
  const resourceAttributes = resource?.attributes ?? {};
  if (typeof eventId !== "string" || !eventId.startsWith("evt_") ||
      typeof eventType !== "string" || typeof resource?.id !== "string") {
    return reply(400, { error: "invalid_event_envelope" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const resourceIsInvoice = resource.type === "invoice";
  const providerSubscriptionId = resourceIsInvoice
    ? resourceAttributes.resource_id
    : resource.id;
  const invoiceId = resourceIsInvoice ? resource.id : null;

  const { error: insertError } = await admin.from("nexora_subscription_events").insert({
    provider: "paymongo",
    provider_event_id: eventId,
    event_type: eventType,
    provider_payment_id: invoiceId,
    provider_subscription_id:
      typeof providerSubscriptionId === "string" ? providerSubscriptionId : null,
    event_status: "received",
    payload_sha256: toHex(await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(rawBody),
    )),
  });

  if (insertError && insertError.code !== "23505") {
    return reply(500, { error: "event_persistence_failed" });
  }

  // A duplicate already completed/ignored event is safely acknowledged.
  // Failed or still-received rows are retried rather than silently discarded.
  const { data: ledger, error: ledgerError } = await admin
    .from("nexora_subscription_events")
    .select("id,event_status")
    .eq("provider", "paymongo")
    .eq("provider_event_id", eventId)
    .maybeSingle();
  if (ledgerError || !ledger) return reply(500, { error: "event_ledger_unavailable" });
  if (insertError?.code === "23505" &&
      (ledger.event_status === "processed" || ledger.event_status === "ignored")) {
    return reply(200, { received: true, duplicate: true });
  }

  const finish = async (status: "processed" | "ignored" | "failed", errorCode?: string) => {
    const { error } = await admin.from("nexora_subscription_events").update({
      event_status: status,
      processed_at: status === "failed" ? null : new Date().toISOString(),
      error_code: errorCode ?? null,
    }).eq("id", ledger.id);
    if (error) throw new Error("event_ledger_update_failed");
  };

  try {
    const subscriptionEvents = new Set([
      "subscription.activated",
      "subscription.past_due",
      "subscription.unpaid",
      "subscription.updated",
    ]);
    const invoiceEvents = new Set([
      "subscription.invoice.paid",
      "subscription.invoice.payment_failed",
    ]);

    if (!subscriptionEvents.has(eventType) && !invoiceEvents.has(eventType)) {
      await finish("ignored");
      return reply(200, { received: true, processed: true, ignored: true });
    }

    if (typeof providerSubscriptionId !== "string" ||
        !providerSubscriptionId.startsWith("subs_")) {
      throw new Error("subscription_reference_missing");
    }

    const subscription = await getPayMongoResource(
      `subscriptions/${providerSubscriptionId}`,
      paymongoSecret,
    );
    const sub = subscription.attributes;
    if (sub.livemode !== isLive || typeof sub.customer_id !== "string" ||
        typeof sub.plan?.id !== "string") {
      throw new Error("provider_subscription_invalid");
    }

    const weeklyProviderPlan = Deno.env.get(`PAYMONGO_WEEKLY_PLAN_ID_${mode.toUpperCase()}`);
    const monthlyProviderPlan = Deno.env.get(`PAYMONGO_MONTHLY_PLAN_ID_${mode.toUpperCase()}`);
    const planId = sub.plan.id === weeklyProviderPlan ? "nexora_weekly_66" :
      sub.plan.id === monthlyProviderPlan ? "nexora_monthly_99" : null;
    if (!planId) throw new Error("provider_plan_not_allowlisted");

    const { data: plan, error: planError } = await admin
      .from("nexora_subscription_plans")
      .select("id,amount_php,currency")
      .eq("id", planId)
      .eq("active", true)
      .maybeSingle();
    if (planError || !plan) throw new Error("nexora_plan_unavailable");

    const { data: localSubscription, error: localError } = await admin
      .from("nexora_subscriptions")
      .select("id,user_id,plan_id,provider_customer_id,status")
      .eq("provider", "paymongo")
      .eq("provider_mode", mode)
      .eq("provider_subscription_id", providerSubscriptionId)
      .maybeSingle();
    if (localError || !localSubscription) throw new Error("local_subscription_not_found");
    if (localSubscription.plan_id !== plan.id ||
        localSubscription.provider_customer_id !== sub.customer_id) {
      throw new Error("subscription_owner_or_plan_mismatch");
    }

    let nextStatus: "pending" | "active" | "past_due" | "cancelled" | "expired" | null = null;
    let periodEnd: string | null = null;

    if (eventType === "subscription.invoice.paid" ||
        eventType === "subscription.invoice.payment_failed") {
      if (!invoiceId || !invoiceId.startsWith("inv_")) {
        throw new Error("invoice_reference_missing");
      }
      const invoice = await getPayMongoResource(`invoices/${invoiceId}`, paymongoSecret);
      const inv = invoice.attributes;
      const invoiceSubscriptionId = inv.subscription?.id ?? inv.resource_id;
      if (inv.livemode !== isLive || invoiceSubscriptionId !== providerSubscriptionId ||
          inv.customer_id !== sub.customer_id || inv.currency !== "PHP" ||
          inv.amount !== plan.amount_php * 100) {
        throw new Error("invoice_amount_currency_or_owner_mismatch");
      }

      if (eventType === "subscription.invoice.paid") {
        if (inv.status !== "paid" || sub.status !== "active") {
          throw new Error("invoice_or_subscription_not_paid_active");
        }
        nextStatus = "active";
        periodEnd = toIsoDate(sub.next_billing_schedule);
        if (!periodEnd || new Date(periodEnd).getTime() <= Date.now()) {
          throw new Error("next_billing_date_invalid");
        }
      } else {
        if (inv.status === "paid") {
          // A late/reordered failure event must never downgrade a paid invoice.
          await finish("ignored");
          return reply(200, { received: true, processed: true, ignored: true });
        }
        nextStatus = sub.status === "unpaid" ? "expired" : "past_due";
      }
    } else {
      if (eventType === "subscription.past_due" || sub.status === "past_due") {
        nextStatus = "past_due";
      } else if (eventType === "subscription.unpaid" || sub.status === "unpaid") {
        nextStatus = "expired";
      } else if (sub.status === "cancelled" || sub.status === "incomplete_cancelled") {
        nextStatus = "cancelled";
      } else {
        // An "active" subscription snapshot alone is not payment proof.
        await finish("ignored");
        return reply(200, { received: true, processed: true, ignored: true });
      }
    }

    const update: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };
    if (periodEnd) {
      update.current_period_end = periodEnd;
      update.current_period_start = new Date().toISOString();
    }
    const { error: updateError } = await admin.from("nexora_subscriptions")
      .update(update)
      .eq("id", localSubscription.id);
    if (updateError) throw new Error("subscription_state_update_failed");

    await finish("processed");
    return reply(200, { received: true, processed: true, subscription_status: nextStatus });
  } catch (error) {
    const code = error instanceof Error ? error.message : "reconciliation_failed";
    try {
      await finish("failed", code.slice(0, 120));
    } catch {
      // Return 500 so PayMongo retries; never acknowledge an unrecorded failure.
    }
    return reply(500, { error: "subscription_reconciliation_failed", code });
  }
});
