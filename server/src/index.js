const express = require('express');
const https = require('https');
const http = require('http'); // Import http module
const fs = require('fs');       // <--- Import File System module
const path = require('path');     // <--- Import Path module
const socketIo = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const db = require('./db');
const { initDb } = db;
const { runMigrations } = require('./migrate');
const { migrate: dereferenceInlineImages } = require('./scripts/migrate-inline-image-refs');
const jwt = require('jsonwebtoken');
const notesRoutes = require('./routes/notes');
const tagsRoutes = require('./routes/tags');
const imagesRoutes = require('./routes/images');
const attachmentsRoutes = require('./routes/attachments');
const objectsRoutes = require('./routes/objects');
const importRoutes = require('./routes/import');
const aiRoutes = require('./routes/ai');
const authRoutes = require('./routes/auth');
const remindersRoutes = require('./routes/reminders');
const settingsRoutes = require('./routes/settings');
const foxitRoutes = require('./routes/foxit');
const backupRoutes = require('./routes/backup');
const mirrorRoutes = require('./routes/mirror');
const scheduler = require('./services/scheduler');
const demoReset = require('./services/demoReset');
const settingsService = require('./services/settings');
const backupScheduler = require('./services/backupScheduler');
const mirrorWorker = require('./mirror/mirrorWorker');
const { optionalAuth, authenticateToken, getJwtSecret } = require('./middleware/auth');
const { handleMcpPost, handleMcpUnsupported } = require('./mcp/httpHandler');

// Load environment variables
require('dotenv').config();

const app = express();
const port = process.env.SERVER_PORT || process.env.PORT || 5000;

// The server always runs behind the nginx client container (and optionally
// Caddy), which forward the real client IP in X-Forwarded-For. Trust one hop so
// rate limiters key on the actual client rather than the proxy's container IP.
// Override with TRUST_PROXY_HOPS when fronted by additional proxies.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// --- Determine if HTTPS should be used ---
const useHttps = process.env.USE_HTTPS === 'true';

let server;

if (useHttps) {
  console.log('Starting server with HTTPS');
  const isProduction = process.env.NODE_ENV === 'production';
  const keyPath = isProduction ? process.env.KEY_PATH : path.join(__dirname, '../../client/cert/key.pem');
  const certPath = isProduction ? process.env.CERT_PATH : path.join(__dirname, '../../client/cert/cert.pem');

  // HTTPS options
  const httpsOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  server = https.createServer(httpsOptions, app);
} else {
  console.log('Starting server with HTTP');
  server = http.createServer(app);
}

// --- Attach Socket.IO to the Server ---
// Socket.IO works with an https server instance just fine
const io = socketIo(server, {
  cors: {
    origin: '*', // Consider restricting this in production later
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  connectTimeout: 60000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 5e6,
  transports: ['websocket', 'polling']
});
// -----------------------------------------

// Make io available to routes
app.set('io', io);

// Middleware
app.use(cors()); // Consider more specific CORS settings for production

// Configure Express to handle large file uploads - MUST come before routes
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb', extended: true }));

// Set server timeouts for large file handling (applies to the HTTPS server)
server.timeout = 3600000; // 1 hour

// Configure the server for large file handling
app.use((req, res, next) => {
  req.setTimeout(3600000);
  res.setTimeout(3600000);
  next();
});

// Serve uploaded files (images, attachments, objects). Uploads are
// attacker-controlled (e.g. SVG with inline script), so never let the
// browser execute them same-origin: force download, sandbox, no sniffing.
// These headers don't affect <img>/subresource loads, only navigation.
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res) => {
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// Intercept responses to broadcast updates via Socket.io
// MUST be placed BEFORE routes so that route handlers call the wrapped res.json
app.use((req, res, next) => {
  const originalJson = res.json;
  res.json = function (body) {
    // Use originalUrl to get the full path including /api prefix
    const fullPath = req.originalUrl.split('?')[0]; // Remove query params

    // Intercept note changes
    // Skip POST to /api/notes (note creation) - routes already emit note_created explicitly
    // This prevents duplicate socket events (note_created + note_updated for the same operation)
    if (fullPath.startsWith('/api/notes') && req.method !== 'GET') {
      if (body.notes) {
        io.emit('notes_updated', body.notes);
      } else if (body.note && req.method !== 'POST') {
        // Only emit note_updated for PUT/PATCH, not POST (creation handled by route)
        io.emit('note_updated', body.note);
      } else if (req.method === 'DELETE' && !body.tags) {
        // Only emit note_deleted if this is an actual note deletion (not tag removal)
        // Tag removal returns { tags }, note deletion returns { message }
        io.emit('note_deleted', req.params.id);
      } else if (req.method === 'PATCH') {
        let noteId = req.params.id;
        let operation = fullPath.split('/').pop();
        io.emit('note_operation', { id: noteId, operation });
      }
    }

    // Intercept object changes to broadcast updates
    if (fullPath.startsWith('/api/objects') && req.method !== 'GET') {
      console.log('[SOCKET BROADCAST] Object route detected:', fullPath, req.method);
      console.log('[SOCKET BROADCAST] Response body has object?', !!body.object);
      if (body.object) {
        console.log('[SOCKET BROADCAST] Emitting object_updated for:', body.object.id);
        io.emit('object_updated', body.object);
      } else if (req.method === 'DELETE' && body.object) {
        io.emit('object_deleted', body.object.id);
      }
    }

    originalJson.call(this, body);
  };
  next();
});

// Public, unauthenticated liveness probe for container/orchestrator healthchecks.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Throttle credential endpoints to blunt online password brute-forcing. The
// app is single-user, so legitimate login/setup/change-password traffic is
// rare — a tight cap costs nothing and stops automated guessing of the one
// account password. Counts failures and successes alike; successful logins are
// infrequent enough not to trip it.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/setup', authLimiter);
app.use('/api/auth/change-password', authLimiter);

// Route prefixes
app.use('/api/auth', authRoutes);
app.use('/api/notes', optionalAuth, notesRoutes);
app.use('/api/tags', optionalAuth, tagsRoutes);
app.use('/api/ai', optionalAuth, aiRoutes);
app.use('/api/reminders', optionalAuth, remindersRoutes);
app.use('/api/settings', optionalAuth, settingsRoutes);
app.use('/api/objects', optionalAuth, objectsRoutes);
app.use('/api/foxit', foxitRoutes); // No auth - snooper needs access
app.use('/api/backup', optionalAuth, backupRoutes);
app.use('/api/mirror', optionalAuth, mirrorRoutes);
app.use('/api', optionalAuth, imagesRoutes);
app.use('/api', optionalAuth, attachmentsRoutes);
app.use('/api/import', optionalAuth, importRoutes);

// Built-in MCP endpoint (Streamable HTTP). Opt-in via the MCP_ENABLED setting
// (Settings → AI Features), and gated by the same JWT as the REST API so AI
// clients must present a valid token — see POST /api/auth/mcp-token for a
// long-lived one. Stateless, read-only tools (search/get/list notes, list tags).
const requireMcpEnabled = (req, res, next) => {
  if (process.env.MCP_ENABLED !== 'true') {
    return res.status(404).json({ message: 'MCP endpoint is disabled' });
  }
  next();
};
// Claude Desktop's "custom connector" UI only accepts a URL (it expects OAuth,
// which we don't implement), so it can't send an Authorization header. Allow the
// token via ?token= as a fallback — scoped to /mcp only, never the REST API — so
// users can paste a single URL. authenticateToken still does the actual verifying.
const allowMcpQueryToken = (req, res, next) => {
  if (!req.headers['authorization'] && req.query.token) {
    req.headers['authorization'] = `Bearer ${req.query.token}`;
  }
  next();
};
app.post('/mcp', requireMcpEnabled, allowMcpQueryToken, authenticateToken, handleMcpPost);
app.get('/mcp', requireMcpEnabled, allowMcpQueryToken, authenticateToken, handleMcpUnsupported);
app.delete('/mcp', requireMcpEnabled, allowMcpQueryToken, authenticateToken, handleMcpUnsupported);

// Gate every socket connection behind the same JWT as the REST API. Without
// this, anyone reaching the port could listen to io.emit broadcasts and stream
// the user's notes in real time without authenticating.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
    || socket.handshake.headers?.authorization?.split(' ')[1];
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    socket.user = jwt.verify(token, getJwtSecret());
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// Socket.io events (keep as is)
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.onAny((event, ...args) => {
    // Maybe reduce logging noise in production
    // if (process.env.NODE_ENV !== 'production') {
    //   console.log(`[SERVER] Socket ${socket.id} emitted '${event}':`, args);
    // }
  });

  socket.on('join', (room) => {
    socket.join(room);
    console.log(`Socket ${socket.id} joined room: ${room}`);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
    console.log(`Socket ${socket.id} left room: ${room}`);
  });

  socket.on('test_event', (data) => {
    console.log(`[SERVER] Received test event from ${socket.id}:`, data);
    socket.emit('test_response', { message: 'Direct response to sender' });
    io.emit('broadcast_test', { message: 'Broadcast to all clients' });
  });

  socket.on('keep_alive', (data) => {
    if (Math.random() < 0.1) {
      // console.log(`Keep-alive ping from ${socket.id}:`, data);
    }
    socket.emit('keep_alive_response', {
      timestamp: Date.now(),
      serverReceived: data.timestamp,
      latency: data.timestamp ? Date.now() - data.timestamp : null
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Auto-generate JWT_SECRET on first startup so users don't have to.
// Precedence: explicit .env value > previously generated DB value > new random.
async function ensureJwtSecret() {
  const fromEnv = process.env.JWT_SECRET;
  const placeholder = 'change-this-to-a-long-random-secret';
  if (fromEnv && fromEnv !== placeholder) return;

  const existing = await db.query("SELECT value FROM settings WHERE key = 'JWT_SECRET'");
  if (existing.rows[0]?.value) {
    process.env.JWT_SECRET = existing.rows[0].value;
    return;
  }

  const secret = crypto.randomBytes(48).toString('hex');
  await db.query(
    "INSERT INTO settings (key, value) VALUES ('JWT_SECRET', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [secret]
  );
  process.env.JWT_SECRET = secret;
  console.log('[auth] JWT_SECRET auto-generated and persisted to database');
}

// Initialize the database before starting the server
async function startServer(retryCount = 0, maxRetries = 10) {
  try {
    await initDb();
    await runMigrations();
    // Idempotent data migration: rewrite any inline base64 note images into
    // lightweight note_images references. A no-op once there's nothing inline.
    try {
      await dereferenceInlineImages();
    } catch (err) {
      console.error('[migrate-inline-image-refs] Skipped (non-fatal):', err.message);
    }
    await ensureJwtSecret();
    await settingsService.init();
    await backupScheduler.init();
    // Markdown mirror (DB → folder). No-op unless MD_MIRROR_ENABLED=true.
    mirrorWorker.init({ io });
    // Listen on 0.0.0.0 to accept connections from other devices on the network
    server.listen(port, '0.0.0.0', () => {
      // Update log message to reflect HTTPS
      console.log(`Server listening on port ${port} (${useHttps ? 'HTTPS' : 'HTTP'})`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);

    // If database is not reachable and we have retries left, retry with exponential backoff
    if (retryCount < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Max 5 seconds
      console.log(`Retrying server startup in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      setTimeout(() => {
        startServer(retryCount + 1, maxRetries);
      }, delay);
      return;
    }

    // After max retries, give up and exit
    console.error('Max retries reached, server failed to start');
    process.exit(1);
  }
}

// Initialize Scheduler
scheduler.init(io);
demoReset.init(io);

startServer();


module.exports = server; // Export the server for testing or other purposes