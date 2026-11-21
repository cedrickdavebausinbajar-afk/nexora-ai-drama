import { initializeApp, getApps } from '@firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, getToken } from '@firebase/app-check';
import { getFunctions, httpsCallable } from '@firebase/functions';
import { Capacitor } from '@capacitor/core';

const config = {
  apiKey: import.meta.env.VITE_NEXORA_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_NEXORA_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_NEXORA_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_NEXORA_FIREBASE_APP_ID
};
const siteKey = import.meta.env.VITE_NEXORA_APPCHECK_RECAPTCHA_SITE_KEY;
let sendReport = null;
let lastReportAt = 0;

function safeText(value, limit) {
  return String(value ?? '').replace(/[\\r\\n\\t]/g, ' ').slice(0, limit);
}

function initializeReporter() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId || !siteKey) {
    console.info('[NEXORA monitoring] Not configured; client error reporting is disabled.');
    return;
  }
  try {
    const app = getApps().find(item => item.name === 'nexora-error-monitor') ||
      initializeApp(config, 'nexora-error-monitor');
    if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
      // App Check uses the registered Firebase Web App + reCAPTCHA provider in the
      // Capacitor WebView. This is not native Play Integrity attestation.
    }
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true
    });
    const functions = getFunctions(app, 'us-central1');
    const callable = httpsCallable(functions, 'reportClientError');
    sendReport = async payload => {
      await getToken(appCheck, false);
      return callable(payload);
    };
  } catch (error) {
    console.warn('[NEXORA monitoring] Initialization failed.', error);
  }
}

function report(error, title, severity = 'error') {
  if (!sendReport) return;
  const now = Date.now();
  if (now - lastReportAt < 15000) return;
  lastReportAt = now;
  const err = error instanceof Error ? error : new Error(safeText(error, 2000));
  const payload = {
    source: Capacitor.isNativePlatform() ? 'android' : 'website',
    severity,
    title: safeText(title || err.name || 'Client error', 120),
    message: safeText(err.message || err, 2000),
    stack: safeText(err.stack || '', 8000),
    version: safeText(import.meta.env.VITE_APP_VERSION || 'unknown', 60),
    location: safeText(window.location.pathname, 300),
    device: safeText(navigator.userAgent, 120)
  };
  Promise.resolve(sendReport(payload)).catch(error => {
    console.warn('[NEXORA monitoring] Could not submit an error report.', error);
  });
}

initializeReporter();
window.addEventListener('error', event => {
  report(event.error || event.message, 'Uncaught JavaScript error');
});
window.addEventListener('unhandledrejection', event => {
  report(event.reason, 'Unhandled promise rejection');
});

export { report as reportNexoraClientError };
