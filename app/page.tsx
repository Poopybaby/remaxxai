import Link from "next/link";
import { Suspense } from "react";
import { HeroCtas, SignedOutCtas } from "@/components/landing/hero-ctas";
import { RemixChain } from "@/components/landing/remix-chain";
import { ClosingCta, ForWho, HowItWorks, WhatItIs, WhyRemaxx } from "@/components/landing/sections";

export default function LandingPage() {
  return (
    <div className="flex w-full flex-col">
      <section className="mx-auto grid w-full max-w-7xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 py-10 sm:px-6 lg:min-h-[calc(100svh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-6 lg:py-12">
        <div className="flex flex-col gap-6">
          <h1 className="type-wide text-display font-black text-balance">
            Remix what inspires you.
          </h1>
          <p className="text-muted max-w-[46ch] text-lg leading-relaxed">
            Browse sites, tools and UI kits people built with AI. Open one, describe the changes you
            want, and publish your version with credit to the original maker. Or start from a blank
            page.
          </p>
          {/* Signed-out buttons render instantly; signed-in people get theirs once the session is read. */}
          <Suspense fallback={<SignedOutCtas />}>
            <HeroCtas />
          </Suspense>
          <Link
            href="/explore"
            className="text-muted hover:text-fg w-fit text-sm font-semibold underline-offset-4 hover:underline"
          >
            Or just look around: explore the gallery →
          </Link>
        </div>

        <RemixChain />
      </section>

      <div className="border-line/70 border-t">
        <WhatItIs />
      </div>
      <HowItWorks />
      <WhyRemaxx />
      <ForWho />
      <ClosingCta>
        <Suspense fallback={<SignedOutCtas />}>
          <HeroCtas />
        </Suspense>
      </ClosingCta>
    </div>
  );
}
