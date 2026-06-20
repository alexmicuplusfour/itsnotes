'use strict';

const { Client } = require('pg');

// Dedicated LISTEN/NOTIFY connection for the Markdown mirror's live fast path.
//
// The periodic reconcile sweep (mirrorWorker) is the source of correctness; this
// just lowers latency. The DB triggers (migration 0007) emit the affected note's
// UUID on channel 'mirror_note' whenever a note (or a row that feeds its file)
// changes, and we reconcile just that one file a beat later.
//
// Why a separate connection (not the shared pool): a LISTEN must stay on one
// long-lived connection, which a pool would recycle. NOTIFY is fire-and-forget,
// so if we're ever disconnected we lose those events — hence on every (re)connect
// we kick a full sweep to recover whatever changed while we were away.

const CHANNEL = 'mirror_note';
const DEBOUNCE_MS = 1500;   // coalesce the burst of writes a single save produces
const RECONNECT_MS = 5000;
const MAX_PENDING = 50;     // bulk op? stop tracking individuals, do one sweep

let handlers = null; // { reconcileOne, runSweep }
let client = null;
let connected = false;
let connecting = false;
let stopping = false;
let reconnectTimer = null;
let sweepTimer = null;
const pending = new Map(); // noteId -> debounce timer

function clientConfig() {
  return {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    keepAlive: true,
  };
}

// A burst of notifications (bulk delete/archive) would otherwise spawn one
// reconcile per note. Past a threshold, drop the per-note work and let a single
// sweep converge everything — cheaper and still correct.
function coalesceToSweep() {
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  if (sweepTimer) clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    Promise.resolve(handlers.runSweep()).catch((err) =>
      console.error('[md-mirror] live sweep failed:', err.message)
    );
  }, DEBOUNCE_MS);
}

function scheduleReconcile(noteId) {
  if (sweepTimer) return; // a coalesced sweep is already pending — it'll cover this
  if (pending.size >= MAX_PENDING) return coalesceToSweep();

  const existing = pending.get(noteId);
  if (existing) clearTimeout(existing);
  pending.set(
    noteId,
    setTimeout(async () => {
      pending.delete(noteId);
      try {
        await handlers.reconcileOne(noteId);
      } catch (err) {
        console.error('[md-mirror] live reconcile failed:', err.message);
      }
    }, DEBOUNCE_MS)
  );
}

function scheduleReconnect() {
  connected = false;
  connecting = false;
  if (client) {
    try { client.removeAllListeners(); } catch { /* noop */ }
    try { client.end().catch(() => {}); } catch { /* noop */ }
  }
  client = null;
  if (stopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

async function connect() {
  if (connected || connecting || stopping) return;
  connecting = true;
  const c = new Client(clientConfig());
  client = c;
  c.on('notification', (msg) => {
    if (msg.channel === CHANNEL && msg.payload) scheduleReconcile(msg.payload);
  });
  c.on('error', (err) => {
    console.error('[md-mirror] listener connection error:', err.message);
    scheduleReconnect();
  });
  c.on('end', () => scheduleReconnect());

  try {
    await c.connect();
    await c.query(`LISTEN ${CHANNEL}`);
    connected = true;
    connecting = false;
    console.log('[md-mirror] live listener connected (LISTEN mirror_note).');
    // Recover anything that changed while we weren't listening.
    Promise.resolve(handlers.runSweep()).catch(() => {});
  } catch (err) {
    console.error('[md-mirror] listener connect failed:', err.message);
    scheduleReconnect();
  }
}

// Idempotent: connects + LISTENs if not already up. Safe to call repeatedly
// (e.g. once per sweep tick) so enabling the feature at runtime takes effect.
function start(h) {
  handlers = h;
  stopping = false;
  connect();
}

async function stop() {
  stopping = true;
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sweepTimer) { clearTimeout(sweepTimer); sweepTimer = null; }
  if (client) {
    try { await client.end(); } catch { /* noop */ }
  }
  client = null;
  connected = false;
  connecting = false;
}

function isConnected() {
  return connected;
}

module.exports = { start, stop, isConnected };
