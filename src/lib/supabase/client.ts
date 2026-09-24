'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { requireSupabaseConfig } from './config';

let client: SupabaseClient<Database> | undefined;
export function getSupabase() {
  if (!client) {
    const { url, key } = requireSupabaseConfig();
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
