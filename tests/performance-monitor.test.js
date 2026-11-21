import test from 'node:test';
import assert from 'node:assert/strict';
import { startNexoraPerformanceMonitor } from '../performance-monitor.js';

test('performance monitor is safe when browser APIs are unavailable', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousPerformance = globalThis.performance;
  try {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.performance;
    assert.equal(startNexoraPerformanceMonitor(), false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousPerformance === undefined) delete globalThis.performance; else globalThis.performance = previousPerformance;
  }
});

test('performance monitor registers startup, video and network observers once', () => {
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    performance: globalThis.performance,
    console: globalThis.console,
    PerformanceObserver: globalThis.PerformanceObserver
  };
  const listeners = {};
  const documentListeners = {};
  const events = [];
  const win = {
    __nexoraPerformanceMonitorStarted: false,
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    setTimeout(fn) { fn(); },
    gtag(_command, name, params) { events.push({name, params}); }
  };
  const doc = {
    readyState: 'complete',
    addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); }
  };
  const perf = { now: () => 125, getEntriesByType: () => [] };
  try {
    globalThis.window = win;
    globalThis.document = doc;
    globalThis.performance = perf;
    globalThis.console = { info() {} };
    delete globalThis.PerformanceObserver;
    assert.equal(startNexoraPerformanceMonitor(), true);
    assert.equal(startNexoraPerformanceMonitor(), false);
    assert.ok(events.some(event => event.name === 'nexora_startup_ready_ms'));
    assert.ok(listeners.online?.length);
    assert.ok(listeners.offline?.length);
    for (const type of ['playing', 'waiting', 'stalled', 'error']) assert.ok(documentListeners[type]?.length);
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  }
});
