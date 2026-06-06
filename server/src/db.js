const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  keepAlive: true,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 5000,
});

// Verify database connectivity — schema is managed by migrations/
const initDb = async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[db] Database connection verified.');
  } catch (error) {
    console.error('[db] Database connection failed:', error);
    throw error;
  }
};

module.exports = {
  pool,
  initDb,
  query: (text, params) => pool.query(text, params),
};