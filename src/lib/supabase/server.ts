import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { requireSupabaseConfig } from './config';

export async function serverClient() {
  const { url, key } = requireSupabaseConfig();
  const store = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) { values.forEach(({name,value,options}) => store.set(name,value,options)); },
    },
  });
}
