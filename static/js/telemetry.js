/**
 * telemetry.js – Client-side monitoring beacon
 * Sends lightweight activity data to /api/telemetry every 30s
 * Also captures JS errors and page navigation events
 */

(function () {
  'use strict';

  const INTERVAL_MS  = 30_000;   // send every 30 seconds
  const MAX_ERRORS   = 10;       // cap error buffer
  const MAX_ACTIONS  = 20;       // cap action buffer

  let _sessionId  = _generateId();
  let _pageStart  = Date.now();
  let _errorBuf   = [];
  let _actionBuf  = [];
  let _timer      = null;

  // ── Generate a random session id ──────────────────────────────────────────
  function _generateId() {
    return 'tel_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }

  // ── Capture unhandled JS errors ────────────────────────────────────────────
  window.addEventListener('error', function (e) {
    if (_errorBuf.length >= MAX_ERRORS) return;
    _errorBuf.push({
      msg:  String(e.message).slice(0, 200),
      src:  String(e.filename || '').replace(location.origin, '').slice(0, 100),
      line: e.lineno || 0,
      ts:   Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', function (e) {
    if (_errorBuf.length >= MAX_ERRORS) return;
    _errorBuf.push({
      msg:  String(e.reason || 'Promise rejection').slice(0, 200),
      src:  'promise',
      line: 0,
      ts:   Date.now(),
    });
  });

  // ── Track page interactions (anonymised) ───────────────────────────────────
  window._telTrack = function (action, detail) {
    if (_actionBuf.length >= MAX_ACTIONS) return;
    _actionBuf.push({ action: String(action).slice(0, 50), detail: String(detail || '').slice(0, 100) });
  };

  // ── Build payload ──────────────────────────────────────────────────────────
  function _buildPayload() {
    const mem = (performance.memory && performance.memory.usedJSHeapSize)
      ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
      : 0;
    const conn = navigator.connection || {};
    return {
      session_id:      _sessionId,
      page_url:        location.pathname,            // pathname only, no query string
      action_type:     'heartbeat',
      duration_ms:     Date.now() - _pageStart,
      memory_mb:       mem,
      connection_type: String(conn.effectiveType || conn.type || '').slice(0, 20),
      viewport_w:      window.innerWidth,
      viewport_h:      window.innerHeight,
      errors:          _errorBuf.splice(0),          // drain buffer
      actions:         _actionBuf.splice(0),
    };
  }

  // ── Send beacon ────────────────────────────────────────────────────────────
  function _send() {
    const token = localStorage.getItem('ml_token');
    if (!token) return;
    const payload = _buildPayload();
    // Use sendBeacon for reliability on page unload; fetch otherwise
    const body = JSON.stringify(payload);
    if (document.visibilityState === 'hidden' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/telemetry', blob);
    } else {
      fetch('/api/telemetry', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body,
        keepalive: true,
      }).catch(() => {});   // silently ignore network errors
    }
  }

  // ── Reset page timer on navigation ────────────────────────────────────────
  function _onPageChange() {
    _send();
    _pageStart = Date.now();
  }

  // ── Lifecycle hooks ────────────────────────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') _send();
    else _pageStart = Date.now();
  });

  window.addEventListener('beforeunload', _send);

  // Intercept hash/history navigation
  window.addEventListener('hashchange', _onPageChange);
  const _origPushState = history.pushState;
  if (_origPushState) {
    history.pushState = function () {
      _origPushState.apply(this, arguments);
      _onPageChange();
    };
  }

  // ── Start interval ─────────────────────────────────────────────────────────
  function start() {
    if (_timer) return;
    _timer = setInterval(_send, INTERVAL_MS);
    // Send once on load after a short delay
    setTimeout(_send, 5000);
  }

  function stop() {
    if (_timer) { clearInterval(_timer); _timer = null; }
  }

  // Auto-start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Expose for manual control
  window._telemetry = { start, stop, track: window._telTrack, sessionId: _sessionId };
})();
