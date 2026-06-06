const { migrate } = require('postgres-migrations');
const path = require('path');
const { pool } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('[migrations] Running pending migrations...');
    const results = await migrate({ client }, MIGRATIONS_DIR);
    if (results.length === 0) {
      console.log('[migrations] No pending migrations.');
    } else {
      results.forEach(r => console.log(`[migrations] Applied: ${r.fileName}`));
    }
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
