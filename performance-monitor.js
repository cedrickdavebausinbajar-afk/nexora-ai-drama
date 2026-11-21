const VIDEO_EVENT_COOLDOWN_MS = 10000;

function emitMetric(name, value, params = {}) {
  if (!Number.isFinite(value)) return;
  const rounded = Math.round(value * 10) / 10;
  try {
    globalThis.window?.gtag?.('event', name, {
      app_name: 'NEXORA AI DRAMA',
      value: rounded,
      ...params
    });
  } catch {}
  try {
    globalThis.console?.info?.('[NEXORA performance]', name, rounded, params);
  } catch {}
}

function readNavigationMetrics(perf) {
  const nav = perf?.getEntriesByType?.('navigation')?.[0];
  if (!nav) return null;
  return {
    domContentLoadedMs: nav.domContentLoadedEventEnd - nav.startTime,
    loadEventMs: nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : null,
    responseMs: nav.responseEnd - nav.requestStart,
    transferBytes: Number(nav.transferSize || 0)
  };
}

export function startNexoraPerformanceMonitor() {
  const win = globalThis.window;
  const doc = globalThis.document;
  const perf = globalThis.performance;
  if (!win || !doc || !perf || win.__nexoraPerformanceMonitorStarted) return false;
  win.__nexoraPerformanceMonitorStarted = true;

  const startedAt = perf.now();
  const lastVideoEvent = new WeakMap();
  const videoBufferingStartedAt = new WeakMap();
  const reportStartup = () => {
    const startupMs = perf.now() - startedAt;
    emitMetric('nexora_startup_ready_ms', startupMs);
    const nav = readNavigationMetrics(perf);
    if (nav) {
      emitMetric('nexora_navigation_domcontentloaded_ms', nav.domContentLoadedMs);
      if (nav.loadEventMs !== null) emitMetric('nexora_navigation_load_ms', nav.loadEventMs);
      emitMetric('nexora_navigation_response_ms', nav.responseMs);
      emitMetric('nexora_navigation_transfer_bytes', nav.transferBytes);
    }
    sampleMemory();
  };
  const sampleMemory = () => {
    const memory = perf.memory;
    if (memory && Number.isFinite(memory.usedJSHeapSize)) {
      emitMetric('nexora_js_heap_used_bytes', memory.usedJSHeapSize);
      emitMetric('nexora_js_heap_limit_bytes', memory.jsHeapSizeLimit);
    }
  };

  if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
    win.setTimeout(reportStartup, 0);
  } else {
    win.addEventListener('DOMContentLoaded', reportStartup, { once: true });
  }
  win.addEventListener('nexora:app-ready', () => {
    emitMetric('nexora_app_shell_ready_ms', perf.now() - startedAt);
  }, { once: true });

  if (typeof globalThis.PerformanceObserver === 'function') {
    try {
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.duration >= 50) emitMetric('nexora_long_task_ms', entry.duration);
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {}
  }

  const onVideoActivity = event => {
    const video = event.target;
    if (!video || String(video.tagName || '').toLowerCase() !== 'video') return;
    const now = perf.now();
    const previous = lastVideoEvent.get(video) || {};
    if (previous[event.type] && now - previous[event.type] < VIDEO_EVENT_COOLDOWN_MS) return;
    previous[event.type] = now;
    lastVideoEvent.set(video, previous);
    if (event.type === 'waiting') videoBufferingStartedAt.set(video, now);
    if (event.type === 'playing') {
      const bufferingAt = videoBufferingStartedAt.get(video);
      if (Number.isFinite(bufferingAt)) {
        emitMetric('nexora_video_buffering_ms', now - bufferingAt, {
          video_ready_state: Number(video.readyState || 0)
        });
        videoBufferingStartedAt.delete(video);
      }
    }
    const params = {
      event_category: 'video_playback',
      video_ready_state: Number(video.readyState || 0),
      video_network_state: Number(video.networkState || 0)
    };
    if (event.type === 'error') params.video_error_code = Number(video.error?.code || 0);
    emitMetric('nexora_video_' + event.type, 1, params);
  };
  for (const type of ['playing', 'waiting', 'stalled', 'error']) {
    doc.addEventListener(type, onVideoActivity, true);
  }
  doc.addEventListener('error', event => {
    if (String(event.target?.tagName || '').toLowerCase() === 'img') {
      emitMetric('nexora_thumbnail_load_error', 1);
    }
  }, true);
  if (typeof win.setInterval === 'function') {
    win.setInterval(() => {
      if (doc.visibilityState !== 'hidden') sampleMemory();
    }, 60000);
  }

  win.addEventListener('online', () => emitMetric('nexora_network_online', 1));
  win.addEventListener('offline', () => emitMetric('nexora_network_offline', 1));
  return true;
}
