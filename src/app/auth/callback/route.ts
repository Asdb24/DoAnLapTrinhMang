import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/public-url.mjs';
import { desktopRequestOrigin } from '@/lib/account-deletion';

export async function GET(request:Request) {
  const url = new URL(request.url);
  const origin = process.env.CHATFLOW_RUNTIME === 'electron' ? desktopRequestOrigin(request, process.env) : appOrigin(url.origin);
  if (!origin) return NextResponse.json({ error: 'Invalid callback listener.' }, { status: 403 });
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
