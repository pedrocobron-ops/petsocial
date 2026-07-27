import { createClient } from "@supabase/supabase-js";

// Chave anon é pública por design (protegida por Row Level Security no banco).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://aefrcwysifgniogumxwk.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZnJjd3lzaWZnbmlvZ3VteHdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2ODQwNjksImV4cCI6MjA5NDI2MDA2OX0.9NsFNJ6mN4bwfgU5PmfzAmOEm5WzzUW7KYtCjA6khs4";

// fetch com timeout: se o banco não responder em 8s, a página renderiza
// com estado vazio em vez de travar o build/render.
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, { ...init, signal: AbortSignal.timeout(8000) });
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { fetch: fetchWithTimeout },
});
