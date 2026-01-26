import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://jtedqfzmkxajxerpmwfx.supabase.co'

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0ZWRxZnpta3hhanhlcnBtd2Z4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NDI3OTgsImV4cCI6MjA4NTAxODc5OH0.RV8jLTJs5DrR1sS458lFGpJgA5yjPl7Hi-QlGoTO2ZY'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

export async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
}
