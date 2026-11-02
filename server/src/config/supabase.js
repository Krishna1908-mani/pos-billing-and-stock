const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://bxaaejvtpswezmgywnub.supabase.co';
// On backend, prioritize the trusted service role key for full administrative operations, falling back to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    console.log('[Supabase Server] Client initialized successfully for:', supabaseUrl);
  } catch (error) {
    console.error('[Supabase Server] Initialization error:', error.message);
  }
} else {
  console.log('[Supabase Server] URL or Key missing. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in server/.env');
}

/**
 * Check if Supabase client is configured and available
 */
const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseKey && supabase);
};

/**
 * Test connectivity with Supabase by pinging health endpoint or querying a table
 */
const testSupabaseConnection = async () => {
  if (!supabase) {
    return {
      connected: false,
      message: 'Supabase client is not initialized. Please set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in server/.env'
    };
  }

  try {
    // Attempt a light select to test active connection and authentication
    const { data, error } = await supabase.from('products').select('count', { count: 'exact', head: true });
    if (error) {
      // If table doesn't exist yet, it still confirms authentication and connectivity to the Supabase project
      if (error.code === 'PGRST204' || error.code === '42P01') {
        return {
          connected: true,
          authenticated: true,
          schemaReady: false,
          message: 'Connected to Supabase project. Schema tables not yet created (run supabase_schema.sql in SQL Editor).'
        };
      }
      return {
        connected: false,
        error: error.message,
        code: error.code
      };
    }

    return {
      connected: true,
      authenticated: true,
      schemaReady: true,
      message: 'Successfully connected and verified against Supabase PostgreSQL.'
    };
  } catch (err) {
    return {
      connected: false,
      error: err.message
    };
  }
};

module.exports = {
  supabase,
  isSupabaseConfigured,
  testSupabaseConnection
};

