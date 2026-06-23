import api from './api';

// Keep the REST connection warm.
//
// The socket connection has its own heartbeat (see socket.js), so it stays
// alive and the app looks connected. But ordinary API calls (create/search/
// save/open) travel on a *separate* HTTP connection that has no heartbeat. The
// client nginx closes idle upstream connections after 60s (keepalive_timeout),
// so after a minute of no activity that connection is torn down — and the next
// action pays a full TCP + TLS handshake before the request even starts. That's
// the "app went cold and needs to warm up" lag on the first action after a pause.
//
// A tiny periodic request on the same axios instance real actions use keeps that
// connection (and its TLS session) hot, so the first click is as fast as the
// tenth. It's best-effort: only while the window is visible, and failures are
// ignored.
const HEARTBEAT_INTERVAL_MS = 40000; // < nginx keepalive_timeout (60s), with margin

class KeepWarmService {
  constructor() {
    this._interval = null;
    this._started = false;
  }

  // Hit the public, DB-free health endpoint. Rides the same origin/connection as
  // authenticated requests (connection reuse is per-origin, not per-path), so it
  // keeps precisely the path real actions use warm.
  _ping = () => {
    if (document.visibilityState !== 'visible') return;
    api.get('/health').catch(() => {});
  };

  _handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      // Returning to the app: warm the connection immediately rather than
      // waiting up to a full interval for the next tick.
      this._ping();
    }
  };

  start() {
    if (this._started) return;
    this._started = true;
    document.addEventListener('visibilitychange', this._handleVisibility);
    this._interval = setInterval(this._ping, HEARTBEAT_INTERVAL_MS);
    this._ping(); // warm immediately on start
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    document.removeEventListener('visibilitychange', this._handleVisibility);
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }
}

// Singleton instance
const keepWarmService = new KeepWarmService();
export default keepWarmService;
