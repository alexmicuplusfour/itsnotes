const knex = require('knex');
const knexConfig = require('../knexfile');

// Create Knex instance
const db = knex(knexConfig);

// Test the connection
const testConnection = async () => {
  try {
    await db.raw('SELECT 1');
    console.log('Knex database connection successful');
  } catch (error) {
    console.error('Knex database connection failed:', error);
    throw error;
  }
};

module.exports = {
  db,
  testConnection
};
