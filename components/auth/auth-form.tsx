"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AUTH_PROVIDERS, enabledAuthProviders, type AuthProviderId } from "@/config/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { safeNextPath } from "@/lib/security/hosts";
import { isSupabaseConfiguredInBrowser, loadSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils/cn";

const CALLBACK_ERRORS: Record<string, string> = {
  expired:
    "That sign-in link has expired or was already used. Each link works once. Send yourself a new one below.",
  browser:
    "That link was opened in a different browser from the one you requested it in. Send a new link and open it here, or type the code from the email.",
  callback: "That sign-in link didn't work. Send yourself a new one below.",
  denied: "Sign-in was cancelled. Try again.",
  oauth: "Sign-in with that provider was cancelled or failed. Try again.",
};

const PROVIDERS = enabledAuthProviders();

/**
 * Sign in and sign up share one form: Supabase creates the account on first sign-in either way.
 * `logos` lists providers whose official logo file is in public/brand/ (checked at build time).
 */
export function AuthForm({ mode, logos }: { mode: "signin" | "signup"; logos: AuthProviderId[] }) {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"), "/");
  const initialError = CALLBACK_ERRORS[params.get("error") ?? ""] ?? null;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState<AuthProviderId | null>(null);
  // Email is the fallback when providers are on; otherwise it's the only way, so it's shown.
  const [showEmail, setShowEmail] = useState(PROVIDERS.length === 0 || Boolean(initialError));
  const configured = isSupabaseConfiguredInBrowser();
  // Starts loading the sign-in SDK as soon as someone shows intent, so it's ready on submit.
  const warmUp = () => void loadSupabaseBrowserClient().catch(() => {});
  const otherPage = mode === "signup" ? "/login" : "/signup";
  const otherHref = next === "/" ? otherPage : `${otherPage}?next=${encodeURIComponent(next)}`;

  function callbackUrl() {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setStatus("sending");
    const supabase = await loadSupabaseBrowserClient().catch(() => null);
    if (!supabase) {
      setStatus("idle");
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
      return;
    }
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl(), shouldCreateUser: true },
    });
    if (otpError) {
      setStatus("idle");
      setError(
        otpError.status === 429
          ? "Too many emails requested. Wait a few minutes and try again."
          : "We couldn't send the email. Check the address and try again.",
      );
      return;
    }
    setStatus("sent");
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    const token = code.replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) {
      setCodeError("Enter the number code from the email.");
      return;
    }
    setVerifying(true);
    setCodeError(null);
    const supabase = await loadSupabaseBrowserClient().catch(() => null);
    if (!supabase) {
      setVerifying(false);
      setCodeError("We couldn't reach the sign-in service. Check your connection and try again.");
      return;
    }
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    if (verifyError) {
      setVerifying(false);
      setCodeError("That code didn't work. It may have expired. Check it, or send a new email.");
      return;
    }
    // A full navigation on purpose: /auth/continue is a route handler that reads the new session
    // cookie on the server and redirects, which client-side routing can't follow.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/auth/continue?next=${encodeURIComponent(next)}`);
  }

  async function signInWith(provider: AuthProviderId) {
    setError(null);
    setRedirecting(provider);
    const supabase = await loadSupabaseBrowserClient().catch(() => null);
    if (!supabase) {
      setRedirecting(null);
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
      return;
    }
    const p = AUTH_PROVIDERS[provider];
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: p.supabase,
      options: { redirectTo: callbackUrl(), ...(p.scopes ? { scopes: p.scopes } : {}) },
    });
    if (oauthError) {
      setRedirecting(null);
      setError(CALLBACK_ERRORS.oauth ?? null);
    }
  }

  if (!configured) {
    return (
      <p
        role="alert"
        className="border-line bg-panel text-muted rounded-[var(--radius-control)] border px-4 py-3"
      >
        Sign-in isn&apos;t set up on this deployment yet. Add the Supabase keys from .env.example to
        enable it.
      </p>
    );
  }

  if (status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-fg text-lg font-semibold">Check your email</p>
        <p className="text-muted">
          We sent a message to <span className="text-fg">{email.trim()}</span> with a link and a
          code. Click the link once, or type the code here.
        </p>
        <form onSubmit={verifyCode} className="mt-2 flex flex-col gap-3" noValidate>
          <Field id="login-code" label="Code from the email" error={codeError ?? undefined}>
            <Input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? "login-code-error" : undefined}
            />
          </Field>
          <Button type="submit" size="lg" disabled={verifying}>
            {verifying ? "Checking…" : mode === "signup" ? "Verify and continue" : "Sign in"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => {
            setStatus("idle");
            setCode("");
            setCodeError(null);
          }}
          className="text-muted hover:text-fg mt-1 w-fit text-sm underline underline-offset-4"
        >
          Use a different email
        </button>
      </div>
    );
  }

  const verb = mode === "signup" ? "Sign up" : "Continue";

  return (
    // Any sign of intent (pointer over the form, focus inside it) starts loading the sign-in SDK.
    <div className="flex flex-col gap-5" onPointerEnter={warmUp} onFocusCapture={warmUp}>
      {PROVIDERS.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {PROVIDERS.map((p) => (
            <Button
              key={p}
              variant="secondary"
              size="lg"
              disabled={redirecting !== null}
              onClick={() => void signInWith(p)}
              className={cn("relative", p === "google" && "border-fg/30")}
            >
              {logos.includes(p) ? (
                // eslint-disable-next-line @next/next/no-img-element -- official provider logo from public/brand
                <img src={`/brand/${p}.svg`} alt="" width={20} height={20} className="size-5" />
              ) : null}
              {redirecting === p
                ? `Opening ${AUTH_PROVIDERS[p].label}…`
                : `${verb} with ${AUTH_PROVIDERS[p].label}`}
            </Button>
          ))}
        </div>
      ) : null}

      {PROVIDERS.length > 0 && !showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="text-muted hover:text-fg w-fit self-center text-sm underline underline-offset-4"
        >
          {verb} with email instead
        </button>
      ) : null}

      {showEmail ? (
        <>
          {PROVIDERS.length > 0 ? (
            <div className="text-faint flex items-center gap-3 text-sm" aria-hidden>
              <span className="bg-line h-px flex-1" /> or with email{" "}
              <span className="bg-line h-px flex-1" />
            </div>
          ) : null}
          <form onSubmit={sendLink} className="flex flex-col gap-3" noValidate>
            <Field
              id="login-email"
              label="Email"
              error={error ?? undefined}
              hint="We'll email you a link and a code. No password needed."
            >
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "login-email-error" : "login-email-hint"}
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              variant={PROVIDERS.length ? "secondary" : "primary"}
              disabled={status === "sending"}
            >
              {status === "sending"
                ? "Sending…"
                : mode === "signup"
                  ? "Email me a link to sign up"
                  : "Email me a sign-in link"}
            </Button>
          </form>
        </>
      ) : error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <p className="text-muted text-center text-sm">
        {mode === "signup" ? "Already have an account? " : "New to REMAXX? "}
        <Link href={otherHref} className="text-fg font-semibold underline underline-offset-4">
          {mode === "signup" ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
