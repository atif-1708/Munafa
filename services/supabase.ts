import { createClient } from '@supabase/supabase-js';

// In a real build, these would be import.meta.env.VITE_SUPABASE_URL
// For this demo environment, ensure you replace these with your actual Supabase credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtedqfzmkxajxerpmwfx.supabase.co'; 
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZWRxZnpta3hhanhlcnBtd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDI3OTgsImV4cCI6MjA4NTAxODc5OH0.RV8jLTJs5DrR1sS458lFGpJgA5yjPl7Hi-QlGoTO2ZY';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session.user;
}