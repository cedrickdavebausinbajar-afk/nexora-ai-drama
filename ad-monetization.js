import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-4497851143738030/2668274674';
const PAYMONGO_PUBLIC_KEY = import.meta.env.VITE_PAYMONGO_PUBLIC_KEY || '';
const PAYMONGO_MODE = PAYMONGO_PUBLIC_KEY.startsWith('pk_live_') ? 'live' : PAYMONGO_PUBLIC_KEY.startsWith('pk_test_') ? 'test' : null;
let consentReady = false;
let initPromise = null;
let consentInfoPromise = null;
let privacyOptionsRequired = false;
let premiumStatus = null;
let requestedView = 'home';
let bannerVisible = false;
let supabaseClient = null;
let authSubscription = null;
let bannerQueue = Promise.resolve();
let bannerRevision = 0;

async function hasActivePremium() {
  if (!supabaseClient || !PAYMONGO_MODE) return false;
  const { data: userResult, error: userError } = await supabaseClient.auth.getUser();
  if (userError) throw userError;
  const user = userResult?.user;
  if (!user) return false;
  const { data, error } = await supabaseClient
    .from('nexora_subscriptions')
    .select('status,current_period_end')
    .eq('user_id', user.id)
    .eq('provider', 'paymongo')
    .eq('provider_mode', PAYMONGO_MODE)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  return (data || []).some(row =>
    row.status === 'active' &&
    row.current_period_end &&
    new Date(row.current_period_end).getTime() > Date.now()
  );
}

async function requestNexoraConsentInfo() {
  if (!consentInfoPromise) {
    consentInfoPromise = AdMob.requestConsentInfo()
      .finally(() => { consentInfoPromise = null; });
  }
  return consentInfoPromise;
}

async function initializeWithConsent() {
  if (!Capacitor.isNativePlatform()) return false;
  if (consentReady) return true;
  if (!initPromise) {
    initPromise = (async () => {
      let consent = await requestNexoraConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
      privacyOptionsRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
      if (!consent.canRequestAds) return false;
      await AdMob.initialize();
      consentReady = true;
      return true;
    })().catch(error => {
      console.warn('NEXORA AdMob consent/initialization unavailable:', error);
      return false;
    }).finally(() => { initPromise = null; });
  }
  return initPromise;
}

async function hideBanner() {
  if (!bannerVisible) return;
  try {
    await AdMob.hideBanner();
    bannerVisible = false;
  } catch (error) {
    console.warn('NEXORA banner could not be hidden:', error);
  }
}

async function applyBannerState(revision) {
  if (!Capacitor.isNativePlatform()) return;
  const allowedViews = new Set(['home', 'feed', 'search', 'saved', 'originals']);
  if (!allowedViews.has(requestedView)) {
    await hideBanner();
    return;
  }

  try {
    premiumStatus = await hasActivePremium();
  } catch (error) {
    // Fail closed: never show ads when subscription status cannot be verified.
    premiumStatus = true;
    console.warn('NEXORA Premium status check failed; ads are paused:', error);
  }

  // Navigation/auth may change while network and consent requests are pending.
  // A stale operation must never re-show a banner on a screen that forbids ads.
  if (revision !== bannerRevision) return;
  if (premiumStatus) {
    await hideBanner();
    return;
  }

  if (!await initializeWithConsent()) return;
  if (revision !== bannerRevision || !allowedViews.has(requestedView) || premiumStatus) return;

  try {
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0
    });
    bannerVisible = true;
    if (revision !== bannerRevision || !allowedViews.has(requestedView)) {
      await hideBanner();
    }
  } catch (error) {
    bannerVisible = false;
    console.warn('NEXORA banner ad could not be displayed:', error);
  }
}

function queueBannerState() {
  const revision = ++bannerRevision;
  bannerQueue = bannerQueue
    .catch(error => { console.warn('NEXORA previous banner operation failed:', error); })
    .then(() => applyBannerState(revision))
    .catch(error => { console.warn('NEXORA banner state update failed:', error); });
  return bannerQueue;
}

export function initializeNexoraAds(supabase) {
  if (!Capacitor.isNativePlatform()) return;
  supabaseClient = supabase || null;
  if (authSubscription?.unsubscribe) authSubscription.unsubscribe();
  authSubscription = null;
  if (supabaseClient?.auth?.onAuthStateChange) {
    const result = supabaseClient.auth.onAuthStateChange(() => {
      premiumStatus = null;
      void queueBannerState();
    });
    authSubscription = result?.data?.subscription || null;
  }
  void queueBannerState();
}

export function setNexoraAdView(view) {
  requestedView = String(view || 'home');
  void queueBannerState();
}

export async function isNexoraPrivacyOptionsRequired() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const consent = await requestNexoraConsentInfo();
    privacyOptionsRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    return privacyOptionsRequired;
  } catch (error) {
    privacyOptionsRequired = false;
    console.warn('NEXORA privacy-options requirement check failed:', error);
    return false;
  }
}

export async function showNexoraPrivacyOptions() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Refresh UMP status immediately before opening the form. The form is
    // only available when Google's published consent message requires it.
    const consent = await requestNexoraConsentInfo();
    privacyOptionsRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    if (!privacyOptionsRequired) {
      window.alert('Google does not currently require a separate privacy-options form for this device or region.');
      return;
    }
    await AdMob.showPrivacyOptionsForm();
  } catch (error) {
    console.warn('NEXORA privacy options are unavailable:', error);
    window.alert('Privacy choices could not be loaded. Please check your connection and try again.');
  }
}

const REWARDED_EPISODE_AD_ID = 'ca-app-pub-4497851143738030/5422109728';

export async function showNexoraRewardedEpisodeAd(userId, attemptNonce) {
  if (!Capacitor.isNativePlatform()) throw new Error('Rewarded episode unlock is available in the NEXORA Android app only.');
  if (!userId || !attemptNonce) throw new Error('A signed-in account and secure reward attempt are required.');
  if (!await initializeWithConsent()) throw new Error('Ad consent is required or rewarded ads are unavailable on this device.');
  await AdMob.prepareRewardVideoAd({ adId: REWARDED_EPISODE_AD_ID, ssv: { userId, customData: attemptNonce }, immersiveMode: true });
  try {
    const reward = await AdMob.showRewardVideoAd();
    if (!reward) throw new Error('The rewarded ad did not confirm a reward.');
    return reward;
  } catch (error) {
    if (error?.code === 'REWARDED_AD_CANCELLED' || error?.message?.includes('REWARDED_AD_CANCELLED')) throw new Error('The ad was closed before the reward was earned. No episode was unlocked.');
    throw error;
  }
}
