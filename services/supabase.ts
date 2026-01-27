import { createClient } from '@supabase/supabase-js';

// Helper to safely access env vars in Vite (import.meta.env) or standard Node/CRA (process.env)
const getEnvVar = (key: string, fallback: string) => {
  try {
    // Check Vite / Modern Standards
    if (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env[key]) {
      return (import.meta as any).env[key];
    }
    // Check Process (Legacy/Node)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    // Ignore ReferenceErrors if process/import.meta don't exist
  }
  return fallback;
};

// Use safe accessors
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL', 'https://jtedqfzmkxajxerpmwfx.supabase.co');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZWRxZnpta3hhanhlcnBtd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDI3OTgsImV4cCI6MjA4NTAxODc5OH0.RV8jLTJs5DrR1sS458lFGpJgA5yjPl7Hi-QlGoTO2ZY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session.user;
}