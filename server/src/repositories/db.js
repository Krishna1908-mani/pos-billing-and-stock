/**
 * StockWise / MFEF - Centralized PostgreSQL Query & Transaction Utility
 */

const { pool } = require('../config/postgres');

/**
 * Execute parameterized query using the pool
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire client for transactional operations
 */
const getClient = () => pool.connect();

/**
 * Helper to execute a function inside an isolated transaction
 */
const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN;');
    const result = await callback(client);
    await client.query('COMMIT;');
    return result;
  } catch (error) {
    await client.query('ROLLBACK;');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  query,
  getClient,
  withTransaction
};

