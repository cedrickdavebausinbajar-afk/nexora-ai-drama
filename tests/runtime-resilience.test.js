import test from 'node:test';
import assert from 'node:assert/strict';
import { safeStorageGet, safeStorageSet, fetchWithTimeout } from '../runtime-resilience.js';

test('storage guards fail closed when localStorage access throws', () => {
  const previous = globalThis.window;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: Object.defineProperty({}, 'localStorage', {
      configurable: true,
      get() { throw new Error('storage blocked'); }
    })
  });
  try {
    assert.equal(safeStorageGet('nexora-update-dismissed'), null);
    assert.equal(safeStorageSet('nexora-update-dismissed', 'v1'), false);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', {configurable:true,value:previous});
  }
});

test('storage guards work normally when localStorage is available', () => {
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = {localStorage:{
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key,value) { values.set(key,String(value)); }
  }};
  try {
    assert.equal(safeStorageGet('version'), null);
    assert.equal(safeStorageSet('version', '1.2.3'), true);
    assert.equal(safeStorageGet('version'), '1.2.3');
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('fetchWithTimeout aborts a stalled request', async () => {
  const stalledFetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, {once:true});
  });
  await assert.rejects(
    fetchWithTimeout('https://example.invalid/version.json', {}, 15, stalledFetch),
    error => error?.name === 'AbortError'
  );
});

test('fetchWithTimeout propagates offline/network errors', async () => {
  const offlineFetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(
    fetchWithTimeout('/app-version.json', {}, 100, offlineFetch),
    /Failed to fetch/
  );
});
