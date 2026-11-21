import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-4497851143738030/2668274674';
let consentReady = false;
let initPromise = null;
let consentInfoPromise = null;
let privacyOptionsRequired = false;
let premiumStatus = null;
let requestedView = 'home';
let bannerVisible = false;
let supabaseClient = null;

async function hasActivePremium() {
  if (!supabaseClient) return false;
  const { data: userResult, error: userError } = await supabaseClient.auth.getUser();
  if (userError) throw userError;
  const user = userResult?.user;
  if (!user) return false;
  const { data, error } = await supabaseClient
    .from('nexora_subscriptions')
    .select('status,current_period_end')
    .eq('user_id', user.id)
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

async function applyBannerState() {
  if (!Capacitor.isNativePlatform()) return;
  const allowedViews = new Set(['home', 'feed', 'search', 'saved', 'originals']);
  const shouldShow = allowedViews.has(requestedView);
  if (!shouldShow) {
    if (bannerVisible) {
      try { await AdMob.hideBanner(); } catch {}
      bannerVisible = false;
    }
    return;
  }

  try {
    const premium = await hasActivePremium();
    premiumStatus = premium;
  } catch (error) {
    // Fail closed: never show ads when subscription status cannot be verified.
    premiumStatus = true;
    console.warn('NEXORA Premium status check failed; ads are paused:', error);
  }

  if (premiumStatus) {
    if (bannerVisible) {
      try { await AdMob.hideBanner(); } catch {}
      bannerVisible = false;
    }
    return;
  }

  if (!await initializeWithConsent()) return;
  try {
    await AdMob.showBanner({
      adId: BANNER_AD_ID,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0
    });
    bannerVisible = true;
  } catch (error) {
    bannerVisible = false;
    console.warn('NEXORA banner ad could not be displayed:', error);
  }
}

export function initializeNexoraAds(supabase) {
  if (!Capacitor.isNativePlatform()) return;
  supabaseClient = supabase;
  if (supabaseClient?.auth?.onAuthStateChange) {
    supabaseClient.auth.onAuthStateChange(() => {
      premiumStatus = null;
      void applyBannerState();
    });
  }
  void applyBannerState();
}

export function setNexoraAdView(view) {
  requestedView = String(view || 'home');
  void applyBannerState();
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
