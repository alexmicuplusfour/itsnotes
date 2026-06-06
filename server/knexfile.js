// Knex configuration file
require('dotenv').config();

module.exports = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'itsnotesuser',
    password: process.env.DB_PASSWORD || 'keeppassword',
    database: process.env.DB_NAME || 'itsnotes',
  },
  pool: {
    min: 2,
    max: 10
  },
  migrations: {
    tableName: 'knex_migrations'
  }
};
