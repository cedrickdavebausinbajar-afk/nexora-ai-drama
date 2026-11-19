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

async function paymongo(
  path: string,
  secret: string,
  method: string,
  body?: unknown,
  idempotencyKey?: string,
) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method,
    headers: {
      "Authorization": `Basic ${btoa(secret + ":")}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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
  const checkoutAttemptId = input.checkout_attempt_id;
  if (typeof checkoutAttemptId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutAttemptId)) {
    return reply(400, { error: "valid_checkout_attempt_id_required" });
  }
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

  // Fail closed if the database plan configuration ever drifts from the
  // customer-facing NEXORA contract. Never silently charge a changed amount
  // or billing interval because of an accidental dashboard edit.
  const expectedPlan = planId === "nexora_weekly_66"
    ? { amount: 66, interval: "week", intervalCount: 1 }
    : { amount: 99, interval: "month", intervalCount: 1 };
  if (plan.amount_php !== expectedPlan.amount ||
      plan.currency !== "PHP" ||
      plan.interval_unit !== expectedPlan.interval ||
      plan.interval_count !== expectedPlan.intervalCount) {
    return reply(503, { error: "plan_configuration_mismatch" });
  }

  const planSecretName = planId === "nexora_weekly_66"
    ? `PAYMONGO_WEEKLY_PLAN_ID_${mode.toUpperCase()}`
    : `PAYMONGO_MONTHLY_PLAN_ID_${mode.toUpperCase()}`;
  const providerPlanId = Deno.env.get(planSecretName);
  if (!providerPlanId) return reply(503, { error: "provider_plan_not_configured" });

  // Verify the actual PayMongo plan, not only its local secret mapping.
  // PayMongo expresses cadence as "weekly" or "monthly" and amount in centavos.
  try {
    const providerPlan = await paymongo(`subscriptions/plans/${providerPlanId}`, paymongoSecret, "GET");
    const attributes = providerPlan?.attributes ?? {};
    const expectedProviderInterval = expectedPlan.interval === "week" ? "weekly" : "monthly";
    if (providerPlan?.id !== providerPlanId ||
        attributes.amount !== expectedPlan.amount * 100 ||
        attributes.currency !== "PHP" ||
        attributes.interval !== expectedProviderInterval ||
        attributes.interval_count !== 1 ||
        attributes.livemode !== (mode === "live") ||
        (attributes.type && attributes.type !== "scheduled")) {
      return reply(503, { error: "provider_plan_configuration_mismatch" });
    }
  } catch {
    return reply(503, { error: "provider_plan_unavailable" });
  }

  // First look up this exact attempt. A retry must recover its existing
  // provider subscription instead of creating a second one.
  const { data: sameAttempt, error: attemptLookupError } = await admin.from("nexora_subscriptions")
    .select("id,plan_id,status,provider_subscription_id,checkout_attempt_id")
    .eq("user_id", user.id)
    .eq("provider", "paymongo")
    .eq("provider_mode", mode)
    .eq("checkout_attempt_id", checkoutAttemptId)
    .maybeSingle();
  if (attemptLookupError) return reply(503, { error: "checkout_state_unavailable" });
  if (sameAttempt && sameAttempt.plan_id !== planId) {
    return reply(409, { error: "checkout_attempt_plan_mismatch" });
  }
  if (sameAttempt && sameAttempt.status !== "pending") {
    return reply(409, { error: "checkout_attempt_not_reusable", status: sameAttempt.status });
  }

  const { data: existingRows, error: existingLookupError } = await admin.from("nexora_subscriptions")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("provider", "paymongo")
    .eq("provider_mode", mode)
    .in("status", ["pending", "active", "past_due"])
    .limit(20);
  if (existingLookupError) return reply(503, { error: "subscription_state_unavailable" });
  const conflictingSubscription = (existingRows ?? []).find(
    (row: { id: string }) => row.id !== sameAttempt?.id,
  );
  if (conflictingSubscription) {
    return reply(409, { error: "subscription_already_exists", status: conflictingSubscription.status });
  }

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
      }, `nexora-customer-${mode}-${user.id}`);
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

    // Persist the attempt before contacting PayMongo. If the network times
    // out, the same attempt can safely repeat the POST with the same provider
    // idempotency key. A concurrent request sees this reservation.
    let attemptRowId = sameAttempt?.id as string | undefined;
    if (!attemptRowId) {
      const { data: reserved, error: reserveError } = await admin.from("nexora_subscriptions")
        .insert({
          user_id: user.id,
          plan_id: plan.id,
          provider: "paymongo",
          provider_mode: mode,
          provider_customer_id: customerId,
          checkout_attempt_id: checkoutAttemptId,
          status: "pending",
        })
        .select("id")
        .single();
      if (reserveError || !reserved?.id) {
        return reply(409, { error: "checkout_attempt_in_progress_or_conflict" });
      }
      attemptRowId = reserved.id;
    }

    let subscription: any;
    if (sameAttempt?.provider_subscription_id) {
      subscription = await paymongo(
        `subscriptions/${sameAttempt.provider_subscription_id}`,
        paymongoSecret,
        "GET",
      );
    } else {
      subscription = await paymongo("subscriptions", paymongoSecret, "POST", {
        data: { attributes: { plan_id: providerPlanId, customer_id: customerId } },
      }, `nexora-subscription-${mode}-${user.id}-${checkoutAttemptId}`);
    }
    const subscriptionId = subscription?.id;
    const invoice = subscription?.attributes?.latest_invoice;
    let paymentIntent = invoice?.payment_intent;
    if (typeof subscriptionId !== "string" || !subscriptionId.startsWith("subs_") ||
        typeof paymentIntent?.id !== "string") {
      throw new Error("incomplete_subscription_response");
    }
    if (invoice?.amount !== plan.amount_php * 100 || invoice?.currency !== "PHP" ||
        subscription?.attributes?.plan?.id !== providerPlanId) {
      throw new Error("provider_plan_amount_mismatch");
    }
    // The subscription response may omit client_key; retrieve the Payment Intent
    // with the secret key so the client can attach a tokenized payment method.
    if (typeof paymentIntent.client_key !== "string") {
      const retrievedIntent = await paymongo(
        `payment_intents/${paymentIntent.id}`,
        paymongoSecret,
        "GET",
      );
      paymentIntent = retrievedIntent?.attributes ? retrievedIntent : paymentIntent;
      if (paymentIntent?.data?.attributes) paymentIntent = paymentIntent.data;
    }
    const clientKey = paymentIntent?.attributes?.client_key ?? paymentIntent?.client_key;
    if (typeof clientKey !== "string") throw new Error("payment_intent_client_key_unavailable");

    const { error: saveError } = await admin.from("nexora_subscriptions")
      .update({
        provider_customer_id: customerId,
        provider_subscription_id: subscriptionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", attemptRowId);
    if (saveError) throw new Error("subscription_record_save_failed");

    return reply(200, {
      subscription_id: subscriptionId,
      payment_intent_id: paymentIntent.id,
      payment_intent_client_key: clientKey,
      payment_intent_status: paymentIntent?.attributes?.status ?? paymentIntent?.status ?? "awaiting_payment_method",
      amount_php: plan.amount_php,
      currency: plan.currency,
      provider_mode: mode,
      message: "Complete the first invoice payment. Premium access starts only after verified payment confirmation.",
    });
  } catch (error) {
    // Do not leak provider response bodies, credentials, or customer details.
    const code = error instanceof Error ? error.message : "checkout_initialization_failed";
    return reply(502, { error: "checkout_initialization_failed", code });
  }
});
