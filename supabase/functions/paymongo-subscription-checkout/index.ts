// NEXORA AI DRAMA: authenticated PayMongo recurring-subscription checkout initializer.
// This creates the provider customer/subscription and returns the first invoice's
// Payment Intent client_key. It does not grant premium access; only verified webhooks do.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function paymongo(path: string, secret: string, method: string, body?: unknown) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method,
    headers: {
      "Authorization": `Basic ${btoa(secret + ":")}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerCode = payload?.errors?.[0]?.code;
    throw new Error(typeof providerCode === "string" ? providerCode : "paymongo_request_failed");
  }
  return payload?.data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(401, { error: "authentication_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paymongoSecret = Deno.env.get("PAYMONGO_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !paymongoSecret) {
    return reply(503, { error: "checkout_not_configured" });
  }

  const mode = paymongoSecret.startsWith("sk_live_") ? "live" :
    paymongoSecret.startsWith("sk_test_") ? "test" : null;
  if (!mode) return reply(503, { error: "invalid_payment_provider_configuration" });

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: "invalid_json" });
  }

  const planId = input.plan_id;
  if (planId !== "nexora_weekly_66" && planId !== "nexora_monthly_99") {
    return reply(400, { error: "unsupported_plan" });
  }

  const firstName = typeof input.first_name === "string" ? input.first_name.trim() : "";
  const lastName = typeof input.last_name === "string" ? input.last_name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80 ||
      !/^\+?[0-9][0-9\s()-]{6,19}$/.test(phone)) {
    return reply(400, { error: "valid_name_and_phone_required" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id || !user.email) return reply(401, { error: "invalid_user_session" });

  const { data: plan, error: planError } = await admin
    .from("nexora_subscription_plans")
    .select("id,name,amount_php,currency,interval_unit,interval_count,active")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();
  if (planError || !plan) return reply(503, { error: "plan_unavailable" });

  const planSecretName = planId === "nexora_weekly_66"
    ? `PAYMONGO_WEEKLY_PLAN_ID_${mode.toUpperCase()}`
    : `PAYMONGO_MONTHLY_PLAN_ID_${mode.toUpperCase()}`;
  const providerPlanId = Deno.env.get(planSecretName);
  if (!providerPlanId) return reply(503, { error: "provider_plan_not_configured" });

  const { data: existing } = await admin.from("nexora_subscriptions")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("provider", "paymongo")
    .eq("provider_mode", mode)
    .in("status", ["pending", "active", "past_due"])
    .limit(1)
    .maybeSingle();
  if (existing) return reply(409, { error: "subscription_already_exists", status: existing.status });

  let customerId: string | null = null;
  const { data: customerRow } = await admin.from("nexora_provider_customers")
    .select("provider_customer_id")
    .eq("user_id", user.id)
    .eq("provider", "paymongo")
    .eq("provider_mode", mode)
    .maybeSingle();
  customerId = customerRow?.provider_customer_id ?? null;

  try {
    if (!customerId) {
      const customer = await paymongo("customers", paymongoSecret, "POST", {
        data: { attributes: {
          first_name: firstName,
          last_name: lastName,
          email: user.email,
          phone,
        } },
      });
      customerId = customer?.id;
      if (typeof customerId !== "string" || !customerId.startsWith("cus_")) {
        throw new Error("invalid_customer_response");
      }
      const { error: customerSaveError } = await admin.from("nexora_provider_customers")
        .upsert({
          user_id: user.id,
          provider: "paymongo",
          provider_mode: mode,
          provider_customer_id: customerId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,provider,provider_mode" });
      if (customerSaveError) throw new Error("customer_mapping_save_failed");
    }

    const subscription = await paymongo("subscriptions", paymongoSecret, "POST", {
      data: { attributes: { plan_id: providerPlanId, customer_id: customerId } },
    });
    const subscriptionId = subscription?.id;
    const invoice = subscription?.attributes?.latest_invoice;
    const paymentIntent = invoice?.payment_intent;
    const clientKey = paymentIntent?.client_key;
    if (typeof subscriptionId !== "string" || !subscriptionId.startsWith("subs_") ||
        typeof paymentIntent?.id !== "string" || typeof clientKey !== "string") {
      throw new Error("incomplete_subscription_response");
    }

    const { error: saveError } = await admin.from("nexora_subscriptions").insert({
      user_id: user.id,
      plan_id: plan.id,
      provider: "paymongo",
      provider_mode: mode,
      provider_customer_id: customerId,
      provider_subscription_id: subscriptionId,
      status: "pending",
    });
    if (saveError) throw new Error("subscription_record_save_failed");

    return reply(200, {
      subscription_id: subscriptionId,
      payment_intent_id: paymentIntent.id,
      payment_intent_client_key: clientKey,
      payment_intent_status: paymentIntent.status ?? "awaiting_payment_method",
      amount_php: plan.amount_php,
      currency: plan.currency,
      message: "Complete the first invoice payment. Premium access starts only after verified payment confirmation.",
    });
  } catch (error) {
    // Do not leak provider response bodies, credentials, or customer details.
    const code = error instanceof Error ? error.message : "checkout_initialization_failed";
    return reply(502, { error: "checkout_initialization_failed", code });
  }
});
