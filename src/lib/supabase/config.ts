export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return null; } catch { return null; }
  return { url, key };
}
export function requireSupabaseConfig() {
  const config = supabaseConfig();
  if (!config) throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local, then restart Next.js.');
  return config;
}
