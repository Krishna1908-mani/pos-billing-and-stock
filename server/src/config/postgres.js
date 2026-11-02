const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || '';

let pool = null;

const isConfigured = Boolean(
  databaseUrl &&
  !databaseUrl.includes('[YOUR-PASSWORD]') &&
  !databaseUrl.includes('YOUR_PASSWORD')
);

// Resolve Supabase Root/Bundle CA Certificate for strict TLS verification
const caCertPath = process.env.SUPABASE_SSL_CA_PATH || path.resolve(__dirname, '../../certs/supabase-ca-bundle.pem');
let sslConfig = {
  rejectUnauthorized: true
};

if (fs.existsSync(caCertPath)) {
  sslConfig.ca = fs.readFileSync(caCertPath, 'utf8');
} else if (process.env.SUPABASE_SSL_CA) {
  sslConfig.ca = process.env.SUPABASE_SSL_CA;
}

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: sslConfig,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      max: 10
    });

    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error] Unexpected idle client error:', err.message);
    });
  } catch (err) {
    console.error('[PostgreSQL Initialization Error]:', err.message);
  }
}

/**
 * Check if PostgreSQL connection string is configured with non-placeholder values
 */
const isPostgresConfigured = () => {
  return isConfigured && pool !== null;
};

/**
 * Query helper with automatic client acquisition and release
 */
const query = async (text, params) => {
  if (!pool) {
    throw new Error('PostgreSQL pool is not initialized. Please configure DATABASE_URL in server/.env');
  }
  return pool.query(text, params);
};

/**
 * Test PostgreSQL connectivity gracefully without crashing the server
 */
const testPostgresConnection = async () => {
  if (!databaseUrl) {
    return {
      connected: false,
      configured: false,
      message: 'DATABASE_URL is not set in server/.env'
    };
  }

  if (databaseUrl.includes('[YOUR-PASSWORD]') || databaseUrl.includes('YOUR_PASSWORD')) {
    return {
      connected: false,
      configured: false,
      message: 'DATABASE_URL contains placeholder [YOUR-PASSWORD]. Please update with your actual Supabase DB password.'
    };
  }

  if (!pool) {
    return {
      connected: false,
      configured: false,
      message: 'PostgreSQL connection pool failed to initialize.'
    };
  }

  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, current_database() as database, version() as version;');
    const row = result.rows[0];

    return {
      connected: true,
      configured: true,
      database: row.database,
      currentTime: row.current_time,
      version: row.version.split(',')[0],
      message: 'Supabase PostgreSQL connection successful.'
    };
  } catch (error) {
    return {
      connected: false,
      configured: true,
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    };
  } finally {
    if (client) {
      client.release();
    }
  }
};

module.exports = {
  pool,
  query,
  isPostgresConfigured,
  testPostgresConnection
};

