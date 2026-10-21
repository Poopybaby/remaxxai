import Link from "next/link";
import { RemixChain } from "@/components/landing/remix-chain";
import { WaitlistForm } from "@/components/landing/waitlist-form";

export default function LandingPage() {
  return (
    <section className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-6 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:py-12">
      <div className="flex flex-col gap-6">
        <h1 className="type-wide text-display font-black text-balance">Remix what inspires you.</h1>
        <p className="text-muted max-w-[46ch] text-lg leading-relaxed">
          Browse sites, tools and UI kits people built with AI. Open one, describe the changes you
          want, and publish your version with credit to the original maker.
        </p>
        <div className="flex flex-col gap-3">
          <WaitlistForm />
          <p className="text-faint text-sm">
            Already have an invite?{" "}
            <Link
              href="/login"
              className="text-fg decoration-magenta font-semibold underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <RemixChain />
    </section>
  );
}
