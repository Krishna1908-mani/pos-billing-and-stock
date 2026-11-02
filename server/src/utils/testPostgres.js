require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { testPostgresConnection, isPostgresConfigured } = require('../config/postgres');

async function main() {
  console.log('====================================================');
  console.log('StockWise / MFEF - Supabase PostgreSQL Connection Test');
  console.log('====================================================');
  
  const rawUrl = process.env.DATABASE_URL || '';
  const sanitizedUrl = rawUrl.replace(/:([^@]+)@/, ':****@');
  console.log('DATABASE_URL:', sanitizedUrl || '(not configured)');
  console.log('Is Configured:', isPostgresConfigured());
  console.log('----------------------------------------------------');

  const result = await testPostgresConnection();
  
  if (result.connected) {
    console.log('STATUS: SUCCESS - CONNECTED');
    console.log(`Database:     ${result.database}`);
    console.log(`Current Time: ${result.currentTime}`);
    console.log(`Server:       ${result.version}`);
  } else {
    console.log('STATUS: NOT CONNECTED');
    console.log(`Reason:       ${result.message}`);
    if (result.code) {
      console.log(`Error Code:   ${result.code}`);
    }
  }
  console.log('====================================================');
  process.exit(result.connected ? 0 : 1);
}

main();

