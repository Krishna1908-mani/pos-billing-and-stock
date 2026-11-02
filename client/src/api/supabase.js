import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://bxaaejvtpswezmgywnub.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

/**
 * Helper to check if frontend Supabase client is configured
 */
export const isSupabaseConfigured = () => {
  return !!(supabaseUrl && supabaseAnonKey && supabase);
};

export default supabase;

