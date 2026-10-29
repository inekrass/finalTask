const path = require('node:path');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

if (!process.env.DATABASE_URL?.trim()) {
  throw new Error('DATABASE_URL не задан. Укажите строку подключения в .env.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (error) => {
  console.error('Ошибка соединения PostgreSQL:', error.code || 'UNKNOWN');
});

module.exports = pool;
