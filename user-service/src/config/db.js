const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  }
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring cloud client', err.stack);
  }
  console.log('Natively connected to Render PostgreSQL (Singapore)!');
  release();
});

module.exports = pool;