import { fetchWithTimeout } from './runtime-resilience.js';

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 1500;

export function parseReleaseVersion(tag) {
  const match = /^v(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/.exec(String(tag || ''));
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return null;
  return { major, minor, patch, code: patch, name: major + '.' + minor + '.' + patch };
}

export function compareReleaseVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  return 0;
}

export function findOfficialApkAsset(release, repo = 'nexoraofficialph/nexora-ai-drama') {
  if (!release || release.draft || release.prerelease) return null;
  const version = parseReleaseVersion(release.tag_name);
  if (!version || !Array.isArray(release.assets)) return null;
  const asset = release.assets.find(item => item?.name === 'NEXORA-AI-DRAMA.apk' &&
    item?.state === 'uploaded' && Number.isSafeInteger(Number(item?.size)) && Number(item.size) > 0);
  if (!asset) return null;
  const expectedUrl = 'https://github.com/' + repo + '/releases/download/' + release.tag_name + '/NEXORA-AI-DRAMA.apk';
  if (asset.browser_download_url !== expectedUrl) return null;
  const digest = typeof asset.digest === 'string' ? asset.digest : '';
  const sha256 = /^sha256:[a-f0-9]{64}$/i.test(digest) ? digest.slice(7).toLowerCase() : '';
  return { url: expectedUrl, size: Number(asset.size), sha256, version };
}

export async function fetchLatestRelease({
  repo = 'nexoraofficialph/nexora-ai-drama',
  fetchImpl = globalThis.fetch,
  sleepImpl = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = DEFAULT_ATTEMPTS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw new RangeError('attempts must be between 1 and 5.');
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) throw new RangeError('retryDelayMs must be a non-negative finite number.');
  const endpoint = 'https://api.github.com/repos/' + repo + '/releases/latest';
  let lastRelease = null;
  let lastTransientError = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(endpoint, {
        headers: { Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      }, 12000, fetchImpl);

      if (response.status === 403 || response.status === 429) {
        const error = new Error('GitHub update service rate limit reached.');
        error.code = 'UPDATE_RATE_LIMIT';
        throw error;
      }
      if (response.status >= 500 && response.status <= 599) {
        const error = new Error('GitHub update service returned HTTP ' + response.status + '.');
        error.code = 'UPDATE_SERVER_ERROR';
        throw error;
      }
      if (!response.ok) {
        const error = new Error('GitHub update service returned HTTP ' + response.status + '.');
        error.code = 'UPDATE_HTTP_ERROR';
        throw error;
      }

      lastRelease = await response.json();
      const apk = findOfficialApkAsset(lastRelease, repo);
      if (apk) return { release: lastRelease, apk, version: apk.version };
      lastTransientError = null;
    } catch (error) {
      if (error?.code === 'UPDATE_RATE_LIMIT' || error?.code === 'UPDATE_HTTP_ERROR') throw error;
      lastTransientError = error;
    }

    if (attempt + 1 < attempts) await sleepImpl(retryDelayMs * (attempt + 1));
  }

  if (lastTransientError) {
    const error = new Error('Could not reach the NEXORA update service after ' + attempts + ' attempts. Check your connection and retry.');
    error.code = lastTransientError?.code === 'UPDATE_SERVER_ERROR' ? 'UPDATE_SERVER_ERROR' : 'UPDATE_NETWORK_ERROR';
    error.cause = lastTransientError;
    throw error;
  }

  const error = new Error('The latest stable release does not have its official APK asset uploaded yet.');
  error.code = 'RELEASE_ASSET_PENDING';
  error.release = lastRelease;
  throw error;
}
