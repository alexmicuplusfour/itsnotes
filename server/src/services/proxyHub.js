const crypto = require('crypto');

class ProxyHub {
  constructor() {
    this.socket = null;
    this.pending = new Map(); // id -> { resolve, reject, timer }
  }

  attach(socket) {
    if (this.socket) {
      console.log('[ProxyHub] Replacing existing proxy client with new connection');
      this.socket.disconnect(true);
    }
    this.socket = socket;
    console.log('[ProxyHub] Proxy agent connected');

    socket.on('fetch:response', ({ id, status, headers, body, error }) => {
      const entry = this.pending.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      this.pending.delete(id);
      if (error) {
        entry.reject(new Error(`Proxy fetch error: ${error}`));
      } else {
        entry.resolve({
          status,
          headers: headers || {},
          body: Buffer.from(body, 'base64'),
        });
      }
    });

    socket.on('disconnect', () => {
      if (this.socket === socket) this.socket = null;
      console.log('[ProxyHub] Proxy agent disconnected');
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Proxy agent disconnected'));
      }
      this.pending.clear();
    });
  }

  isConnected() {
    return this.socket !== null && this.socket.connected;
  }

  async fetch(url, { method = 'GET', headers = {}, timeoutMs = 30000 } = {}) {
    if (!this.isConnected()) throw new Error('No proxy agent connected');
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Proxy fetch timed out for ${url}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.emit('fetch:request', { id, url, method, headers });
    });
  }
}

module.exports = new ProxyHub();
