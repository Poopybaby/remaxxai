import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { DEFAULT_AVATARS } from "@/config/avatars";
import { AUTH_PROVIDERS, type AuthProviderId } from "@/config/auth";
import { FREE_TRIAL_PROMPTS } from "@/config/plans";
import { checkSignInProviders } from "@/lib/supabase/enabled-providers";
import { AuthForm } from "./auth-form";

/** Providers whose official logo has been added to public/brand/<id>.svg (checked at build). */
function availableLogos(): AuthProviderId[] {
  return (Object.keys(AUTH_PROVIDERS) as AuthProviderId[]).filter((p) =>
    existsSync(path.join(process.cwd(), "public", "brand", `${p}.svg`)),
  );
}

function verifyStep(providers: AuthProviderId[]): string {
  const names = providers.map((p) => AUTH_PROVIDERS[p].label);
  if (names.length === 0) return "With a link or code we email you. No password needed.";
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
  return `With ${list}, or a code we email you.`;
}

const STEPS = (providers: AuthProviderId[]) => [
  { title: "Verify it's you", body: verifyStep(providers) },
  { title: "Set up your profile", body: "Pick a handle and one of the crew as your picture." },
  { title: "Start creating", body: "Remix a template or describe something new." },
];

export async function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const signup = mode === "signup";
  // Only providers that Supabase will accept get a button (a half-finished setup is hidden).
  const { shown: providers } = await checkSignInProviders();
  return (
    <section className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16 lg:py-20">
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <h1 className="type-wide text-4xl font-black">
            {signup ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-muted">
            {signup
              ? `Free to join, with ${FREE_TRIAL_PROMPTS} free AI prompts and no card. REMAXX is for people 18 and older.`
              : "Sign in to remix, create and publish. New here? Signing in creates your account."}
          </p>
        </div>
        <Suspense
          fallback={<div className="bg-panel h-56 rounded-[var(--radius-card)]" aria-hidden />}
        >
          <AuthForm mode={mode} providers={providers} logos={availableLogos()} />
        </Suspense>
        <p className="text-faint text-sm">
          By continuing you agree to the{" "}
          <Link
            href="/legal/terms"
            className="text-muted hover:text-fg underline underline-offset-4"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/acceptable-use"
            className="text-muted hover:text-fg underline underline-offset-4"
          >
            Acceptable Use Policy
          </Link>
          , and that you&apos;ve read the{" "}
          <Link
            href="/legal/privacy"
            className="text-muted hover:text-fg underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </div>

      <aside
        aria-label={signup ? "How signing up works" : "About REMAXX"}
        className="border-line bg-panel/60 relative hidden overflow-hidden rounded-[var(--radius-card)] border p-8 lg:flex lg:flex-col lg:gap-8"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-[radial-gradient(circle,var(--color-magenta)_0%,transparent_65%)] opacity-25"
        />
        <div className="flex -space-x-3">
          {DEFAULT_AVATARS.map((a, i) => (
            <span
              key={a.id}
              className="border-ink relative size-16 overflow-hidden rounded-full border-4 transition-transform duration-300 hover:z-10 hover:-translate-y-1.5 motion-reduce:transition-none"
              style={{ zIndex: DEFAULT_AVATARS.length - i }}
              title={`${a.name}: ${a.tagline}`}
            >
              <Image src={a.url} alt="" fill sizes="64px" className="object-cover" />
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-fg text-2xl font-black">Join the crew.</p>
          <p className="text-muted max-w-[40ch]">
            Browse sites and tools people built with AI, remix any of them by describing what you
            want, or start from a blank page. Publish your version with credit to everyone it&apos;s
            built on.
          </p>
        </div>
        <ol className="flex flex-col gap-4">
          {STEPS(providers).map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="bg-magenta/15 text-magenta grid size-7 shrink-0 place-items-center rounded-full text-sm font-black">
                {i + 1}
              </span>
              <span className="flex flex-col">
                <span className="text-fg font-semibold">{s.title}</span>
                <span className="text-muted text-sm">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  );
}
