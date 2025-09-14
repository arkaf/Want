import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// These will be replaced at build time or read from window.__ENV
const SUPABASE_URL = window.__ENV?.SUPABASE_URL || 'https:
const SUPABASE_ANON = window.__ENV?.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqbXZzZWh3bHlwcWhjcXRrbWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzMjIzNDksImV4cCI6MjA3MTg5ODM0OX0.1HYABAtbL4vaScem32AxMWdq9s2T0VoNR_TMyn-Uqjk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    storage: window.localStorage, 
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});