import { Capacitor } from '@capacitor/core';
import { AdMob, AdmobConsentStatus, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';

const BANNER_AD_ID = 'ca-app-pub-4497851143738030/2668274674';
let consentReady = false;
let initPromise = null;
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

async function initializeWithConsent() {
  if (!Capacitor.isNativePlatform()) return false;
  if (consentReady) return true;
  if (!initPromise) {
    initPromise = (async () => {
      let consent = await AdMob.requestConsentInfo();
      if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
        consent = await AdMob.showConsentForm();
      }
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

export async function showNexoraPrivacyOptions() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // Always refresh UMP consent info here. Premium users intentionally skip ad
    // initialization, but must still be able to open the privacy settings entry point.
    let consent = await AdMob.requestConsentInfo();
    if (consent.isConsentFormAvailable && consent.status === AdmobConsentStatus.REQUIRED) {
      consent = await AdMob.showConsentForm();
    }
    if (consent.privacyOptionsRequirementStatus === 'REQUIRED') {
      await AdMob.showPrivacyOptionsForm();
      return;
    }
    if (consent.canRequestAds && !consentReady) {
      await AdMob.initialize();
      consentReady = true;
    }
    window.alert('Google does not currently require a separate privacy-options form for this device or region.');
  } catch (error) {
    console.warn('NEXORA privacy options are unavailable:', error);
    window.alert('Privacy choices could not be loaded. Please check your connection and try again.');
  }
}
