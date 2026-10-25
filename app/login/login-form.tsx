"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { safeNextPath } from "@/lib/security/hosts";
import { isSupabaseConfiguredInBrowser, loadSupabaseBrowserClient } from "@/lib/supabase/browser";

type Provider = "google" | "github";

const CALLBACK_ERRORS: Record<string, string> = {
  expired:
    "That sign-in link has expired or was already used. Each link works once. Send yourself a new one below.",
  browser:
    "That link was opened in a different browser from the one you requested it in. Send a new link and open it here, or type the code from the email.",
  callback: "That sign-in link didn't work. Send yourself a new one below.",
  denied: "Sign-in was cancelled. Try again.",
  oauth: "Sign-in with that provider was cancelled or failed. Try again.",
};

/** Social sign-in buttons appear only for providers switched on in Supabase (see README). */
const PROVIDERS = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "")
  .split(",")
  .map((p) => p.trim().toLowerCase())
  .filter((p): p is Provider => p === "google" || p === "github");

export function LoginForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"), "/");
  const initialError = CALLBACK_ERRORS[params.get("error") ?? ""] ?? null;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(initialError);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const configured = isSupabaseConfiguredInBrowser();
  // Starts loading the sign-in SDK as soon as someone shows intent, so it's ready on submit.
  const warmUp = () => void loadSupabaseBrowserClient().catch(() => {});

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
          ? "Too many sign-in emails requested. Wait a few minutes and try again."
          : "We couldn't send the sign-in email. Check the address and try again.",
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

  async function signInWith(provider: Provider) {
    setError(null);
    const supabase = await loadSupabaseBrowserClient().catch(() => null);
    if (!supabase) {
      setError("We couldn't reach the sign-in service. Check your connection and try again.");
      return;
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    if (oauthError) setError(CALLBACK_ERRORS.oauth ?? null);
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
      <div
        role="status"
        className="border-line bg-panel flex flex-col gap-2 rounded-[var(--radius-card)] border p-5"
      >
        <p className="text-fg font-semibold">Check your email</p>
        <p className="text-muted">
          We sent an email to <span className="text-fg">{email.trim()}</span>. Click the link in it
          once, or type the code from it here.
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
          <Button type="submit" disabled={verifying} className="w-fit">
            {verifying ? "Checking…" : "Sign in with code"}
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

  return (
    // Any sign of intent (pointer over the form, focus inside it) starts loading the sign-in SDK.
    <div className="flex flex-col gap-6" onPointerEnter={warmUp} onFocusCapture={warmUp}>
      {PROVIDERS.length > 0 ? (
        <>
          <div className="flex flex-col gap-2.5">
            {PROVIDERS.includes("google") ? (
              <Button variant="secondary" size="lg" onClick={() => signInWith("google")}>
                <GoogleMark /> Continue with Google
              </Button>
            ) : null}
            {PROVIDERS.includes("github") ? (
              <Button variant="secondary" size="lg" onClick={() => signInWith("github")}>
                <GitHubMark /> Continue with GitHub
              </Button>
            ) : null}
          </div>
          <div className="text-faint flex items-center gap-3 text-sm" aria-hidden>
            <span className="bg-line h-px flex-1" /> or <span className="bg-line h-px flex-1" />
          </div>
        </>
      ) : null}

      <form onSubmit={sendLink} className="flex flex-col gap-3" noValidate>
        <Field id="login-email" label="Email" error={error ?? undefined}>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-email-error" : undefined}
          />
        </Field>
        <Button type="submit" size="lg" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.6.3 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z" />
    </svg>
  );
}
