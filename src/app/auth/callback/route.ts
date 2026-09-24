import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/public-url.mjs';

export async function GET(request:Request) {
  const url = new URL(request.url);
  const origin = appOrigin(url.origin);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const recovery = url.searchParams.get('type') === 'recovery';
  try {
    const client = await serverClient();
    const result = code ? await client.auth.exchangeCodeForSession(code)
      : tokenHash ? await client.auth.verifyOtp({token_hash:tokenHash,type:recovery?'recovery':'email'}) : null;
    if (result && !result.error) return NextResponse.redirect(new URL(recovery?'/reset-password':'/',origin));
  } catch { /* Never return authentication tokens or codes in an error. */ }
  return NextResponse.redirect(new URL('/?auth_error=confirmation',origin));
}
