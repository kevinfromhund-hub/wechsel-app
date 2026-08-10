import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase-Umgebungsvariablen fehlen. Bitte eine .env-Datei mit VITE_SUPABASE_URL und ' +
    'VITE_SUPABASE_ANON_KEY anlegen (siehe .env.example) – Werte findest du in deinem ' +
    'Supabase-Projekt unter "Project Settings" -> "API".'
  );
}

/* Ohne gültige Werte würde createClient() sofort werfen und die komplette
   App mit weißem Bildschirm abstürzen lassen (noch bevor React rendern kann).
   Platzhalter-Werte verhindern den Absturz; App.jsx zeigt stattdessen einen
   Setup-Hinweis, solange isSupabaseConfigured false ist. */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
