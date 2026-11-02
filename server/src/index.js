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
  res.status(200).json({
    status: 'UP',
    system: 'StockWise Inventory & Sales Intelligence System',
    timestamp: new Date().toISOString(),
    databases: {
      mongodb: mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED',
      postgres: pgCheck.connected ? 'CONNECTED' : (isPostgresConfigured() ? 'ERROR' : 'PENDING_CONFIG')
    },
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Dedicated PostgreSQL health check endpoint
app.get('/api/health/postgres', async (req, res) => {
  const result = await testPostgresConnection();
  const statusCode = result.connected ? 200 : (result.configured ? 503 : 200);
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
  Promise.all([
    connectDB(),
    testPostgresConnection()
  ]).then(([mongoConn, pgStatus]) => {
    if (pgStatus.connected) {
      console.log(`[Supabase PostgreSQL Connected] Database: ${pgStatus.database}, Version: ${pgStatus.version}`);
    } else {
      console.warn(`[Supabase PostgreSQL Warning] Not connected: ${pgStatus.error}`);
    }
    serverInstance = app.listen(PORT, () => {
      console.log(`[StockWise Server] Running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
  }).catch((err) => {
    console.error(`[Server Startup Error]`, err);
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
