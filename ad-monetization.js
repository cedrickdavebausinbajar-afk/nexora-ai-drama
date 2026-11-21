import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

// Use Google's sample ad units in Vite development builds; never serve live ads during local/debug testing.
const IS_AD_TEST_BUILD = import.meta.env.VITE_ADMOB_TEST_MODE === 'true' || Boolean(import.meta.env.DEV);
const BANNER_AD_ID = IS_AD_TEST_BUILD
  ? 'ca-app-pub-3940256099942544/9214589741'
  : 'ca-app-pub-4497851143738030/2668274674';
const PAYMONGO_PUBLIC_KEY = import.meta.env.VITE_PAYMONGO_PUBLIC_KEY || '';
const PAYMONGO_MODE = PAYMONGO_PUBLIC_KEY.startsWith('pk_live_') ? 'live' : PAYMONGO_PUBLIC_KEY.startsWith('pk_test_') ? 'test' : null;
let consentReady = false;
let sdkInitialized = false;
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
let adEventListenersReady = false;

async function installAdEventListeners() {
  if (adEventListenersReady) return;
  await Promise.all([
    AdMob.addListener('bannerAdLoaded', () => console.info('[NEXORA][AdMob] Banner load success.')),
    AdMob.addListener('bannerAdFailedToLoad', error => console.warn('[NEXORA][AdMob] Banner load failed:', error)),
    AdMob.addListener('onRewardedVideoAdLoaded', () => console.info('[NEXORA][AdMob] Rewarded load success.')),
    AdMob.addListener('onRewardedVideoAdFailedToLoad', error => console.warn('[NEXORA][AdMob] Rewarded load failed:', error)),
    AdMob.addListener('onRewardedVideoAdShowed', () => console.info('[NEXORA][AdMob] Rewarded show success.')),
    AdMob.addListener('onRewardedVideoAdFailedToShow', error => console.warn('[NEXORA][AdMob] Rewarded show failed:', error)),
    AdMob.addListener('onRewardedVideoAdReward', reward => console.info('[NEXORA][AdMob] Reward earned event:', reward)),
    AdMob.addListener('onRewardedVideoAdDismissed', () => console.info('[NEXORA][AdMob] Rewarded ad dismissed.'))
  ]);
  adEventListenersReady = true;
}

async function hasActivePremium() {
  // If billing configuration is absent, subscription status cannot be verified; suppress ads rather than risk showing them to a paid user.
  if (!supabaseClient || !PAYMONGO_MODE) return true;
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
    .eq('status', 'active')
    .gt('current_period_end', new Date().toISOString())
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
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
      if (!sdkInitialized) {
        await AdMob.initialize();
        await installAdEventListeners();
        sdkInitialized = true;
        console.info('[NEXORA][AdMob] SDK initialized once after consent.');
      }
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

  if (!await initializeWithConsent()) { await hideBanner(); return; }
  if (revision !== bannerRevision || !allowedViews.has(requestedView) || premiumStatus) return;

  try {
    console.info('[NEXORA][AdMob] Banner load requested.');
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0
    });
    bannerVisible = true;
    console.info('[NEXORA][AdMob] Banner displayed.');
    if (revision !== bannerRevision || !allowedViews.has(requestedView)) {
      await hideBanner();
    }
  } catch (error) {
    bannerVisible = false;
    console.warn('[NEXORA][AdMob] Banner load/show failed:', error);
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
    // Re-read the user's choice and reconcile any already-visible banner.
    consentReady = false;
    const updatedConsent = await requestNexoraConsentInfo();
    privacyOptionsRequired = updatedConsent.privacyOptionsRequirementStatus === 'REQUIRED';
    await queueBannerState();
  } catch (error) {
    console.warn('NEXORA privacy options are unavailable:', error);
    window.alert('Privacy choices could not be loaded. Please check your connection and try again.');
  }
}

const REWARDED_EPISODE_AD_ID = IS_AD_TEST_BUILD
  ? 'ca-app-pub-3940256099942544/5224354917'
  : 'ca-app-pub-4497851143738030/5422109728';

export async function showNexoraRewardedEpisodeAd(userId, attemptNonce) {
  if (!Capacitor.isNativePlatform()) throw new Error('Rewarded episode unlock is available in the NEXORA Android app only.');
  if (!userId || !attemptNonce) throw new Error('A signed-in account and secure reward attempt are required.');
  if (!await initializeWithConsent()) throw new Error('Ad consent is required or rewarded ads are unavailable on this device.');
  try {
    console.info('[NEXORA][AdMob] Rewarded load requested.');
    await AdMob.prepareRewardVideoAd({ adId: REWARDED_EPISODE_AD_ID, ssv: { userId, customData: attemptNonce }, immersiveMode: true });
    console.info('[NEXORA][AdMob] Rewarded ad loaded; showing after user tap.');
    const reward = await AdMob.showRewardVideoAd();
    if (!reward) throw new Error('The rewarded ad did not confirm a reward.');
    console.info('[NEXORA][AdMob] Reward callback confirmed:', reward);
    return reward;
  } catch (error) {
    console.warn('[NEXORA][AdMob] Rewarded load/show failed:', error);
    if (error?.code === 'REWARDED_AD_CANCELLED' || error?.message?.includes('REWARDED_AD_CANCELLED')) throw new Error('The ad was closed before the reward was earned. No episode was unlocked.');
    throw error;
  }
}
