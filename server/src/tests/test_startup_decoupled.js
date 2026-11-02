const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const http = require('http');
const mongoose = require('mongoose');
const { testPostgresConnection } = require('../config/postgres');

function fetchJson(server, path) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = addr.port;
    const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            body: data
          });
        }
      });
    });
    req.on('error', reject);
  });
}

async function runDecoupledTest() {
  console.log('================================================================');
  console.log('🧪 TASK 2: MONGODB STARTUP DECOUPLING & HEALTH ENDPOINT TEST');
  console.log('================================================================');

  // Ensure Mongoose is disconnected to simulate MongoDB being offline
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Set NODE_ENV to test to prevent auto-listen
  process.env.NODE_ENV = 'test';
  const app = require('../index');

  // 1. Verify PostgreSQL is healthy
  console.log('\n[1/3] Verifying primary PostgreSQL connection...');
  const pgStatus = await testPostgresConnection();
  if (!pgStatus.connected) {
    throw new Error(`Primary PostgreSQL is not connected: ${pgStatus.message}`);
  }
  console.log(`✅ Primary PostgreSQL connected: ${pgStatus.database} (${pgStatus.version})`);

  // Start test server on random port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    // 2. Query /api/health with MongoDB DISCONNECTED
    console.log('\n[2/3] Testing /api/health with MongoDB DISCONNECTED...');
    const res = await fetchJson(server, '/api/health');

    console.log(`HTTP Status: ${res.statusCode}`);
    console.log('Response body:', JSON.stringify(res.body, null, 2));

    if (res.statusCode !== 200) {
      throw new Error(`Expected HTTP 200 when PostgreSQL is connected, got ${res.statusCode}`);
    }

    if (res.body.status !== 'UP') {
      throw new Error(`Expected body.status to be 'UP', got ${res.body.status}`);
    }

    if (res.body.databases.postgres.status !== 'CONNECTED') {
      throw new Error(`Expected postgres.status to be 'CONNECTED', got ${res.body.databases.postgres.status}`);
    }

    if (res.body.databases.mongodb.status !== 'DISCONNECTED') {
      throw new Error(`Expected mongodb.status to be 'DISCONNECTED', got ${res.body.databases.mongodb.status}`);
    }

    if (res.body.databases.mongodb.required !== false) {
      throw new Error(`Expected mongodb.required to be false, got ${res.body.databases.mongodb.required}`);
    }

    console.log('✅ /api/health correctly returns HTTP 200 and status UP when PostgreSQL is healthy even with MongoDB offline!');

    // 3. Test /api/health/postgres endpoint
    console.log('\n[3/3] Testing dedicated /api/health/postgres endpoint...');
    const pgRes = await fetchJson(server, '/api/health/postgres');
    if (pgRes.statusCode !== 200 || !pgRes.body.success) {
      throw new Error(`Expected /api/health/postgres to return HTTP 200 with success: true`);
    }
    console.log('✅ /api/health/postgres returns HTTP 200 success: true');

    console.log('\n🎉 ALL MONGODB DECOUPLING TESTS PASSED SUCCESSFULLY!');
  } finally {
    server.close();
  }
}

runDecoupledTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
