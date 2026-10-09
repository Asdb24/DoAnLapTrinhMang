"use client";

import React, { useRef, useState } from "react";
import { Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  authenticate: (
    mode: "login" | "register",
    values: { email: string; password: string; displayName: string }
  ) => Promise<boolean>;
  pending: boolean;
  error: string | null;
  notice?: string | null;
  dismissError: () => void;
  resetPassword?: (email: string) => Promise<boolean>;
}

export function AuthScreen({
  authenticate,
  pending,
  error,
  notice,
  dismissError,
  resetPassword,
}: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const ok = await authenticate(mode, { email, password, displayName });
    if (!ok) passwordRef.current?.focus();
  };

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-6 md:p-10 select-none">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-medium">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Command className="size-4" />
          </div>
          <span className="font-semibold text-sm">ChatFlow</span>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">
                {mode === "login" ? "Welcome back" : "Create an account"}
              </CardTitle>
              <CardDescription>
                {mode === "login"
                  ? "Enter your credentials to access your workspace"
                  : "Enter your information to get started"}
              </CardDescription>
            </CardHeader>

            <CardContent>
              {/* Tab switcher matching login-03 button group */}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 mb-6">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "login" ? "secondary" : "ghost"}
                  disabled={pending}
                  onClick={() => {
                    setMode("login");
                    dismissError();
                  }}
                  className="text-xs"
                >
                  Sign in
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === "register" ? "secondary" : "ghost"}
                  disabled={pending}
                  onClick={() => {
                    setMode("register");
                    dismissError();
                  }}
                  className="text-xs"
                >
                  Create account
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === "register" && (
                  <div className="space-y-2">
                    <Label htmlFor="auth-name">Display name</Label>
                    <Input
                      id="auth-name"
                      type="text"
                      placeholder="Alex Smith"
                      autoComplete="name"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      readOnly={pending}
                      disabled={pending}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="auth-email">Email</Label>
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="m@example.com"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={pending}
                    disabled={pending}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-password">Password</Label>
                    {mode === "login" && resetPassword && (
                      <Button
                        type="button"
                        variant="link"
                        className="p-0 h-auto text-xs text-muted-foreground underline-offset-4 hover:underline"
                        disabled={pending || !email.trim()}
                        onClick={() => void resetPassword(email)}
                      >
                        Forgot password?
                      </Button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    ref={passwordRef}
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "register" ? 10 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    readOnly={pending}
                    disabled={pending}
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between"
                  >
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={dismissError}
                      className="underline text-[10px] ml-2 shrink-0 cursor-pointer"
                    >
                      Dismiss error
                    </button>
                  </div>
                )}

                {notice && (
                  <div
                    role="status"
                    className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-primary"
                  >
                    {notice}
                  </div>
                )}

                <Button type="submit" className="w-full mt-2" disabled={pending}>
                  {pending
                    ? "Connecting…"
                    : mode === "login"
                    ? "Continue to workspace"
                    : "Create your account"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
