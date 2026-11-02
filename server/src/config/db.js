const mongoose = require('mongoose');

/**
 * Connect to MongoDB as an optional/legacy standby datastore.
 * In Phase 7+, PostgreSQL is the primary authoritative datastore.
 * Failure to connect to MongoDB must NEVER terminate the server process.
 */
const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';
  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000
    });
    console.log(`[MongoDB Connected - Standby/Archive] Host: ${conn.connection.host}, Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.warn(`[MongoDB Warning] Standby database connection failed: ${error.message}`);
    console.warn('[MongoDB Notice] Server startup continues unimpeded with PostgreSQL as the authoritative primary.');
    return null;
  }
};

module.exports = connectDB;
