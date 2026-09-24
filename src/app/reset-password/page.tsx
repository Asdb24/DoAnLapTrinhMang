"use client";
import { useRef, useState } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  const busy=useRef(false);
  return <section className="flex flex-1 items-center justify-center p-6"><div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6"><h1 className="text-2xl font-semibold">Set a new password</h1>
    {done?<><p role="status">Your password has been updated.</p><Button asChild><Link href="/">Return to messages</Link></Button></>:<form className="space-y-4" onSubmit={async event=>{
      event.preventDefault();if(busy.current)return;setError('');
      if(password!==confirm){setError('The passwords do not match.');return;}
      busy.current=true;setPending(true);
      try{const result=await getSupabase().auth.updateUser({password});if(result.error)throw result.error;setPassword('');setConfirm('');setDone(true);}
      catch(cause){setError(cause instanceof Error?cause.message:'Password could not be updated. Try requesting a new reset link.');}
      finally{busy.current=false;setPending(false);}
    }}><div className="space-y-2"><Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={event=>setPassword(event.target.value)} readOnly={pending}/></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={10} required value={confirm} onChange={event=>setConfirm(event.target.value)} readOnly={pending}/></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={pending}>{pending?'Updating…':'Update password'}</Button></form>}
  </div></section>;
}
