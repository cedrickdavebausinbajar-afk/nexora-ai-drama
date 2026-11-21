export function safeStorageGet(key) {
  try {
    return globalThis.window?.localStorage?.getItem(String(key)) ?? null;
  } catch (error) {
    return null;
  }
}

export function safeStorageSet(key, value) {
  try {
    if (!globalThis.window?.localStorage) return false;
    globalThis.window.localStorage.setItem(String(key), String(value));
    return true;
  } catch (error) {
    return false;
  }
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('timeoutMs must be a positive finite number.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options?.signal;
  const abortFromExternal = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  else externalSignal?.addEventListener?.('abort', abortFromExternal, {once:true});
  try {
    return await fetchImpl(url, {...options, signal:controller.signal});
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener?.('abort', abortFromExternal);
  }
}
