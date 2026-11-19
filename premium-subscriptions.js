import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const PUBLIC_KEY = import.meta.env.VITE_PAYMONGO_PUBLIC_KEY || '';
const CONFIGURED_RETURN_URL = import.meta.env.VITE_NEXORA_PAYMENT_RETURN_URL || '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));

function paymentReturnUrl(subscriptionId) {
  const base = CONFIGURED_RETURN_URL ||
    (!Capacitor.isNativePlatform() && location.protocol === 'https:' ? location.href.split('?')[0] : '');
  if (!base) throw new Error('Payment return URL is not configured for this app build.');
  const url = new URL(base);
  if (url.protocol !== 'https:') throw new Error('Payment return URL must use HTTPS.');
  url.searchParams.set('nexora_payment_return', '1');
  url.searchParams.set('subscription_id', subscriptionId);
  return url.toString();
}

async function paymongoRequest(path, publicKey, body, idempotencyKey) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(publicKey + ':')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.code;
    throw new Error(typeof message === 'string' ? message : 'PayMongo could not process the request.');
  }
  return payload?.data;
}

export async function renderPremiumView(screen, supabase) {
  if (!supabase) {
    screen.innerHTML = '<section class="premium-page"><h1>NEXORA PREMIUM</h1><p>Secure account services are not configured. Please try again later.</p></section>';
    return;
  }

  let authMode = 'signin';
  let notice = '';
  let noticeKind = 'info';

  const render = async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) notice = 'Could not check your account session. Please refresh and try again.';
    const user = sessionData?.session?.user;

    if (!user) {
      screen.innerHTML = `<section class="premium-page">
        <div class="premium-hero"><span class="nx-eyebrow">NEXORA AI DRAMA</span><h1>Unlock NEXORA Premium</h1><p>Enjoy ad-free viewing and exclusive premium dramas.</p></div>
        <div class="premium-auth-card">
          <div class="premium-plan-grid">
            <article><span>WEEKLY</span><strong>₱66</strong><small>Every 7 days</small></article>
            <article><span>MONTHLY</span><strong>₱99</strong><small>Every calendar month</small></article>
          </div>
          <h2>${authMode === 'signin' ? 'Sign in to continue' : 'Create your NEXORA account'}</h2>
          <p class="muted">A NEXORA account is required to link your subscription securely.</p>
          <form id="premiumAuthForm" class="premium-form">
            ${authMode === 'signup' ? '<label>Your name<input name="name" autocomplete="name" maxlength="120" required></label>' : ''}
            <label>Email address<input name="email" type="email" autocomplete="email" required></label>
            <label>Password<input name="password" type="password" minlength="8" autocomplete="${authMode === 'signin' ? 'current-password' : 'new-password'}" required></label>
            <p class="premium-notice ${noticeKind}" role="status">${esc(notice)}</p>
            <button class="gold" type="submit">${authMode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</button>
          </form>
          <button class="premium-text-button" id="premiumAuthToggle" type="button">${authMode === 'signin' ? 'New to NEXORA? Create an account' : 'Already have an account? Sign in'}</button>
        </div>
      </section>`;
      screen.querySelector('#premiumAuthToggle').onclick = () => {
        authMode = authMode === 'signin' ? 'signup' : 'signin';
        notice = '';
        render();
      };
      screen.querySelector('#premiumAuthForm').onsubmit = async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const values = new FormData(form);
        const email = String(values.get('email') || '').trim();
        const password = String(values.get('password') || '');
        button.disabled = true;
        button.textContent = 'PLEASE WAIT…';
        try {
          if (authMode === 'signin') {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            notice = '';
          } else {
            const name = String(values.get('name') || '').trim();
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
              options: { data: { full_name: name } }
            });
            if (error) throw error;
            if (!data.session) {
              notice = 'Account created. Check your email to confirm your address, then sign in here.';
              noticeKind = 'success';
              authMode = 'signin';
              await render();
              return;
            }
          }
          notice = '';
          await render();
        } catch (error) {
          notice = error?.message || 'Account request failed. Please try again.';
          noticeKind = 'error';
          button.disabled = false;
          button.textContent = authMode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT';
          const status = form.querySelector('.premium-notice');
          if (status) status.textContent = notice;
        }
      };
      return;
    }

    let subscriptions = [];
    let subscriptionLoadError = '';
    const { data: rows, error: rowsError } = await supabase
      .from('nexora_subscriptions')
      .select('plan_id,status,current_period_end,created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (rowsError) subscriptionLoadError = 'Subscription database setup is not active yet. Checkout is unavailable until the NEXORA subscription migrations are applied.';
    else subscriptions = rows || [];

    const current = subscriptions.find(row =>
      row.status === 'active' && row.current_period_end && new Date(row.current_period_end).getTime() > Date.now()
    );
    const pending = current ? null : subscriptions.find(row => row.status === 'pending' || row.status === 'past_due');

    screen.innerHTML = `<section class="premium-page">
      <div class="premium-hero"><span class="nx-eyebrow">NEXORA AI DRAMA</span><h1>NEXORA Premium</h1><p>Ad-free viewing and exclusive premium dramas.</p></div>
      <div class="premium-account-row"><span>Signed in as <strong>${esc(user.email)}</strong></span><button class="premium-text-button" id="premiumSignOut" type="button">SIGN OUT</button></div>
      ${current ? `<article class="premium-status-card"><span class="premium-status-pill">ACTIVE</span><h2>Your Premium access is active</h2><p>Plan: ${current.plan_id === 'nexora_weekly_66' ? '₱66 Weekly' : '₱99 Monthly'}</p><small>Next renewal: ${esc(new Date(current.current_period_end).toLocaleDateString())}</small></article>` : ''}
      ${pending ? `<article class="premium-status-card"><span class="premium-status-pill pending">PAYMENT STATUS</span><h2>Subscription ${esc(pending.status)}</h2><p>Complete or verify your first payment. Premium access is granted only after PayMongo confirms payment.</p><button id="premiumRefresh" class="gold-outline" type="button">REFRESH STATUS</button></article>` : ''}
      ${subscriptionLoadError ? `<p class="premium-notice error">${esc(subscriptionLoadError)}</p>` : ''}
      ${!current && !pending && !subscriptionLoadError ? `<div class="premium-checkout-card">
        <div class="premium-plan-grid"><article><span>WEEKLY</span><strong>₱66</strong><small>Every 7 days</small></article><article><span>MONTHLY</span><strong>₱99</strong><small>Every calendar month</small></article></div>
        <h2>Choose your plan</h2>
        <p class="muted">Secure recurring card billing. Your first payment must be completed before Premium is activated.</p>
        <form id="premiumCheckoutForm" class="premium-form">
          <label>Plan<select name="plan_id"><option value="nexora_weekly_66">₱66 — Weekly (every 7 days)</option><option value="nexora_monthly_99">₱99 — Monthly</option></select></label>
          <div class="premium-field-row"><label>First name<input name="first_name" autocomplete="given-name" maxlength="80" required></label><label>Last name<input name="last_name" autocomplete="family-name" maxlength="80" required></label></div>
          <label>Mobile number<input name="phone" type="tel" autocomplete="tel" placeholder="+639XXXXXXXXX" required></label>
          <div class="premium-divider"></div>
          <h3>Card payment</h3>
          <label>Card number<input name="card_number" inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23" required></label>
          <div class="premium-field-row"><label>Expiry month<input name="exp_month" inputmode="numeric" autocomplete="cc-exp-month" placeholder="MM" maxlength="2" required></label><label>Expiry year<input name="exp_year" inputmode="numeric" autocomplete="cc-exp-year" placeholder="YYYY" maxlength="4" required></label><label>Security code<input name="cvc" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required></label></div>
          <p class="premium-security-note">Card details are sent directly to PayMongo using your public key. NEXORA does not send card numbers or security codes to its servers.</p>
          <p class="premium-notice ${noticeKind}" id="premiumCheckoutNotice" role="status">${esc(notice)}</p>
          <button class="gold" type="submit">CONTINUE TO SECURE PAYMENT</button>
        </form>
      </div>` : ''}
    </section>`;

    screen.querySelector('#premiumSignOut').onclick = async () => {
      await supabase.auth.signOut();
      authMode = 'signin';
      notice = '';
      await render();
    };
    screen.querySelector('#premiumRefresh')?.addEventListener('click', () => render());
    const checkoutForm = screen.querySelector('#premiumCheckoutForm');
    if (!checkoutForm) return;
    let checkoutAttemptId = null;
    let checkoutAttemptPlan = null;
    checkoutForm.onsubmit = async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('#premiumCheckoutNotice');
      const values = new FormData(form);
      const firstName = String(values.get('first_name') || '').trim();
      const lastName = String(values.get('last_name') || '').trim();
      const phone = String(values.get('phone') || '').trim();
      const cardNumber = String(values.get('card_number') || '').replace(/\s+/g, '');
      const expMonth = Number(values.get('exp_month'));
      let expYear = Number(values.get('exp_year'));
      const cvc = String(values.get('cvc') || '').trim();
      if (expYear < 100) expYear += 2000;
      if (!/^\d{12,19}$/.test(cardNumber) || !Number.isInteger(expMonth) || expMonth < 1 || expMonth > 12 ||
          !Number.isInteger(expYear) || expYear < new Date().getFullYear() || !/^\d{3,4}$/.test(cvc)) {
        status.textContent = 'Check the card number, expiry date, and security code.';
        status.className = 'premium-notice error';
        return;
      }
      if (!PUBLIC_KEY || !/^pk_(test|live)_/.test(PUBLIC_KEY)) {
        status.textContent = 'Secure card checkout is not configured in this app build yet.';
        status.className = 'premium-notice error';
        return;
      }
      const selectedPlan = String(values.get('plan_id'));
      const paymentAttemptId = crypto.randomUUID();
      if (!checkoutAttemptId || checkoutAttemptPlan !== selectedPlan) {
        checkoutAttemptId = crypto.randomUUID();
        checkoutAttemptPlan = selectedPlan;
      }
      button.disabled = true;
      button.textContent = 'CREATING SECURE PAYMENT…';
      status.textContent = 'Connecting securely to NEXORA and PayMongo…';
      status.className = 'premium-notice info';
      try {
        const { data: checkout, error: checkoutError } = await supabase.functions.invoke('paymongo-subscription-checkout', {
          body: {
            plan_id: selectedPlan,
            checkout_attempt_id: checkoutAttemptId,
            first_name: firstName,
            last_name: lastName,
            phone
          }
        });
        if (checkoutError) throw new Error(checkoutError.message || 'Could not initialize subscription checkout.');
        if (!checkout?.payment_intent_id || !checkout?.payment_intent_client_key || !checkout?.subscription_id) {
          throw new Error(checkout?.error || 'Checkout response is incomplete.');
        }
        const publicMode = PUBLIC_KEY.startsWith('pk_live_') ? 'live' : 'test';
        if (checkout.provider_mode && checkout.provider_mode !== publicMode) {
          throw new Error('Payment key mode does not match the server checkout mode.');
        }
        const paymentMethod = await paymongoRequest('payment_methods', PUBLIC_KEY, {
          data: { attributes: {
            type: 'card',
            details: { card_number: cardNumber, exp_month: expMonth, exp_year: expYear, cvc },
            billing: { name: `${firstName} ${lastName}`, email: user.email, phone }
          } }
        }, `nexora-payment-method-${paymentAttemptId}`);
        if (!paymentMethod?.id) throw new Error('PayMongo did not return a payment method.');
        form.elements.card_number.value = '';
        form.elements.cvc.value = '';
        const returnUrl = paymentReturnUrl(checkout.subscription_id);
        const attached = await paymongoRequest(`payment_intents/${checkout.payment_intent_id}/attach`, PUBLIC_KEY, {
          data: { attributes: {
            payment_method: paymentMethod.id,
            client_key: checkout.payment_intent_client_key,
            return_url: returnUrl
          } }
        }, `nexora-payment-attach-${paymentAttemptId}`);
        const attributes = attached?.attributes || {};
        if (attributes.status === 'awaiting_next_action' && attributes.next_action?.redirect?.url) {
          status.textContent = 'Continue the bank verification to finish your first payment.';
          if (Capacitor.isNativePlatform()) await Browser.open({ url: attributes.next_action.redirect.url });
          else location.assign(attributes.next_action.redirect.url);
          return;
        }
        if (attributes.status === 'succeeded' || attributes.status === 'processing') {
          status.textContent = 'Payment submitted. NEXORA is waiting for PayMongo’s verified confirmation before activating Premium.';
          status.className = 'premium-notice success';
          button.textContent = 'REFRESH PAYMENT STATUS';
          button.disabled = false;
          button.onclick = async e => { e.preventDefault(); await render(); };
          return;
        }
        throw new Error(attributes.last_payment_error?.failed_message || 'Payment was not completed. Check your details and try again.');
      } catch (error) {
        status.textContent = error?.message || 'Payment could not be started. Please try again.';
        status.className = 'premium-notice error';
        button.disabled = false;
        button.textContent = 'CONTINUE TO SECURE PAYMENT';
      }
    };
  };

  await render();
}
