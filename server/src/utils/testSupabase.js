require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { isSupabaseConfigured, testSupabaseConnection } = require('../config/supabase');

async function main() {
  console.log('====================================================');
  console.log('StockWise / MFEF - Supabase Connection Verifier');
  console.log('====================================================');
  console.log('Project URL:', process.env.SUPABASE_URL || '(not set)');
  console.log('Has Secret Key:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log('Has Publishable Key:', !!process.env.SUPABASE_ANON_KEY);
  console.log('----------------------------------------------------');

  if (!isSupabaseConfigured()) {
    console.log('STATUS: PENDING CREDENTIAL CONFIGURATION');
    console.log('Please paste your keys in server/.env:');
    console.log(' - SUPABASE_ANON_KEY=<your_publishable_key>');
    console.log(' - SUPABASE_SERVICE_ROLE_KEY=<your_secret_key>');
    return;
  }

  console.log('Testing connection to Supabase...');
  const result = await testSupabaseConnection();
  console.log('Connection Result:', result);
  console.log('====================================================');
}

main();

