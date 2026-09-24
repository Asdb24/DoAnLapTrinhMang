"use client";

import { useRef, useState } from "react";
import { MessageSquare, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  authenticate: (mode: "login" | "register", values: { email: string; password: string; displayName: string }) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  notice?: string | null;
  dismissError: () => void;
  resetPassword?: (email: string) => Promise<boolean>;
}

export function AuthScreen({ authenticate, pending, error, notice, dismissError, resetPassword }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);
  const submit = async (selected: "login" | "register") => {
    if (pending) return;
    if (!await authenticate(selected, { email, password, displayName })) passwordRef.current?.focus();
  };
  return <main className="min-h-screen w-full overflow-y-auto bg-background flex items-center justify-center p-6">
    <div className="w-full max-w-md space-y-8 py-8">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><MessageSquare className="h-7 w-7" /></div>
        <p className="text-sm font-semibold tracking-wide text-primary">ChatFlow</p>
        <h1 className="text-3xl font-bold tracking-tight">{mode === "login" ? "Your team, in sync." : "Make room for your team."}</h1>
        <p className="text-sm text-muted-foreground">Conversations, ideas, and the people behind them. All together.</p>
      </div>
      <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          {(["login", "register"] as const).map(value => <Button key={value} variant={mode === value ? "secondary" : "ghost"} disabled={pending} onClick={() => { setMode(value); dismissError(); }}>{value === "login" ? "Sign in" : "Create account"}</Button>)}
        </div>
        <form className="space-y-4" onSubmit={async event => { event.preventDefault(); await submit(mode); }}>
          {mode === "register" && <div className="space-y-2"><Label htmlFor="auth-name">Display name</Label><Input id="auth-name" autoComplete="name" required value={displayName} readOnly={pending} onChange={e => setDisplayName(e.target.value)} /></div>}
          <div className="space-y-2"><Label htmlFor="auth-email">Email</Label><Input id="auth-email" type="email" autoComplete="email" required value={email} readOnly={pending} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></div>
          <div className="space-y-2"><Label htmlFor="auth-password">Password</Label><Input ref={passwordRef} id="auth-password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : undefined} value={password} readOnly={pending} onChange={e => setPassword(e.target.value)} /></div>
          {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"><p>{error}</p><button type="button" className="mt-2 underline" onClick={dismissError}>Dismiss error</button></div>}
          <Button type="submit" className="w-full gap-2" disabled={pending}>{pending ? "Connecting…" : mode === "login" ? "Continue to workspace" : "Create your account"}<ArrowRight className="h-4 w-4" /></Button>
        </form>
        {mode==='login'&&resetPassword&&<Button type="button" variant="link" className="w-full" disabled={pending||!email.trim()} onClick={()=>void resetPassword(email)}>Forgot password?</Button>}
        {notice && <p role="status" className="text-sm text-primary">{notice}</p>}
      </div>
    </div>
  </main>;
}

