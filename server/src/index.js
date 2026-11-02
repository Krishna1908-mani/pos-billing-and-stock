require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { isSupabaseConfigured } = require('./config/supabase');
const { testPostgresConnection, isPostgresConfigured } = require('./config/postgres');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Routes
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const purchaseRoutes = require('./routes/purchaseRoutes');
const saleRoutes = require('./routes/saleRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const reportRoutes = require('./routes/reportRoutes');
const restockRoutes = require('./routes/restockRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();

// Security Middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
);

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// General Rate Limiter
app.use('/api', apiLimiter);

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const pgCheck = await testPostgresConnection();
  const isPostgresHealthy = Boolean(pgCheck && pgCheck.connected);
  const mongoStatus = mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED';

  const statusCode = isPostgresHealthy ? 200 : 503;
  res.status(statusCode).json({
    status: isPostgresHealthy ? 'UP' : 'DEGRADED',
    system: 'StockWise Inventory & Sales Intelligence System',
    timestamp: new Date().toISOString(),
    primaryDatastore: 'PostgreSQL',
    databases: {
      postgres: {
        status: isPostgresHealthy ? 'CONNECTED' : (isPostgresConfigured() ? 'ERROR' : 'PENDING_CONFIG'),
        role: 'PRIMARY_AUTHORITATIVE',
        database: pgCheck.database || null,
        version: pgCheck.version || null,
        error: isPostgresHealthy ? null : (pgCheck.message || 'Connection failed')
      },
      mongodb: {
        status: mongoStatus,
        role: 'STANDBY_ARCHIVE',
        required: false
      }
    },
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Dedicated PostgreSQL health check endpoint
app.get('/api/health/postgres', async (req, res) => {
  const result = await testPostgresConnection();
  const statusCode = result.connected ? 200 : 503;
  res.status(statusCode).json({
    success: result.connected,
    postgres: result
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/restock', restockRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 Handler for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Connect DB and listen only if not imported as module in test
let serverInstance = null;

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    // 1. Mandatory PostgreSQL verification - MUST block startup on failure
    console.log('[StockWise Server] Verifying primary database connection (Supabase PostgreSQL)...');
    const pgStatus = await testPostgresConnection();

    if (!pgStatus.connected) {
      console.error(`[FATAL] Primary PostgreSQL connection failed: ${pgStatus.message || 'Unknown database error'}`);
      console.error('[FATAL] StockWise server startup aborted. PostgreSQL is the authoritative primary datastore.');
      process.exit(1);
    }
    console.log(`[Supabase PostgreSQL Connected] Database: ${pgStatus.database}, Version: ${pgStatus.version}`);

    // 2. Optional MongoDB standby connection - Non-fatal
    try {
      await connectDB();
    } catch (mongoErr) {
      console.warn(`[MongoDB Warning] Standby MongoDB connection could not be established: ${mongoErr.message}`);
      console.warn('[MongoDB Notice] Continuing normal server operation with PostgreSQL.');
    }

    // 3. Start HTTP Server
    serverInstance = app.listen(PORT, () => {
      console.log(`[StockWise Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      console.log(`[StockWise Server] Ready for traffic. Primary datastore: PostgreSQL 17.11`);
    });
  })().catch((err) => {
    console.error(`[FATAL] Unexpected startup failure:`, err);
    process.exit(1);
  });

  const gracefulShutdown = async (signal) => {
    console.log(`[StockWise Server] ${signal} signal received. Starting graceful shutdown...`);
    if (serverInstance) {
      serverInstance.close(async () => {
        console.log('[StockWise Server] HTTP server closed.');
        try {
          const { pool } = require('./config/postgres');
          if (pool) {
            await pool.end();
            console.log('[StockWise Server] PostgreSQL connection pool drained.');
          }
          if (mongoose.connection.readyState === 1) {
            await mongoose.disconnect();
            console.log('[StockWise Server] MongoDB disconnected.');
          }
        } catch (cleanupErr) {
          console.error('[StockWise Server] Error during shutdown cleanup:', cleanupErr.message);
        }
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = app;
