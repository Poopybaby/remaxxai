import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-14">
      <div className="flex flex-col gap-3">
        <h1 className="type-wide text-4xl font-black">Sign in</h1>
        <p className="text-muted">
          New here? Signing in creates your account. REMAXX is for people 18 and older.
        </p>
      </div>
      <Suspense
        fallback={<div className="bg-panel h-72 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <LoginForm />
      </Suspense>
      <p className="text-faint text-sm">
        By continuing you agree to the{" "}
        <Link href="/legal/terms" className="text-muted hover:text-fg underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link
          href="/legal/acceptable-use"
          className="text-muted hover:text-fg underline underline-offset-4"
        >
          Acceptable Use Policy
        </Link>
        .
      </p>
    </section>
  );
}
