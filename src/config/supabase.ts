import { createClient } from '@supabase/supabase-js';

// Supabase project credentials
const SUPABASE_URL = 'https://ifkutaryzkimyjyuiwfx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlma3V0YXJ5emtpbXlqeXVpd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMzE0MzAsImV4cCI6MjA4MzgwNzQzMH0.Xc4IHynmO0b7yJwx9ZzZjTNMWz99Jlp9p1OkAlH1veE';

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
