import { createClient } from '@supabase/supabase-js';

// Replace these with your Supabase project credentials
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';

// Check if Supabase is properly configured
export const isSupabaseConfigured =
  SUPABASE_URL &&
  !SUPABASE_URL.includes('your-project') &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_ANON_KEY.includes('your-anon-key');

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase not configured. Using local storage. Update src/config/supabase.ts with your project details.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
