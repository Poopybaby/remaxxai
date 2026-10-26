import type { CSSProperties, ReactNode } from "react";
import { configuredProviders } from "@/lib/ai/server";
import { cn } from "@/lib/utils/cn";

/**
 * The landing hero: one template and two generations of remixes, each showing the prompt that
 * made it and the credit line it carries. It's the product loop in one picture.
 * Pure markup and CSS; no images to download.
 */
export function RemixChain() {
  // The prompt chips name models people can actually pick today.
  const on = configuredProviders();
  const fallback = on.has("openai") ? "ChatGPT" : "AI";
  const second = on.has("anthropic") ? "Claude" : fallback;
  const third = on.has("google") ? "Gemini" : on.has("anthropic") ? "Claude" : fallback;
  return (
    <figure className="relative w-full" aria-labelledby="remix-chain-caption">
      <figcaption id="remix-chain-caption" className="sr-only">
        Example: a coffee pop-up site called Moonbrew by @juno, remixed by @kai into a dark glassy
        version, which @sol remixed again into a loud gig poster. Each remix credits the original.
      </figcaption>

      {/* On phones this row scrolls sideways; focusable so it can be scrolled with the keyboard. */}
      <div
        tabIndex={0}
        role="group"
        aria-label="Example remixes, scroll sideways"
        className={cn(
          "-mx-4 flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto px-4 pt-10 pb-4",
          "lg:mx-0 lg:block lg:h-[600px] lg:overflow-visible lg:px-0 lg:pt-0 lg:pb-0",
        )}
      >
        <ChainCard
          className="lg:absolute lg:top-20 lg:left-0 lg:z-10"
          style={{ "--delay": "80ms", "--from-x": "220px" } as CSSProperties}
          tiltClass="lg:[--tilt:-7deg]"
          title="Moonbrew"
          maker="@juno"
          credit="Original template"
        >
          <PastelSite />
        </ChainCard>

        <ChainCard
          className="lg:absolute lg:top-6 lg:left-[30%] lg:z-20"
          style={{ "--delay": "220ms", "--from-x": "0px" } as CSSProperties}
          tiltClass="lg:[--tilt:-1deg]"
          title="Moonbrew Night"
          maker="@kai"
          credit="Remixed from Moonbrew by @juno"
          prompt={{ model: second, text: "Make it dark and glassy" }}
        >
          <GlassSite />
        </ChainCard>

        <ChainCard
          className="lg:absolute lg:top-28 lg:right-0 lg:z-30"
          style={{ "--delay": "360ms", "--from-x": "-220px" } as CSSProperties}
          tiltClass="lg:[--tilt:6deg]"
          title="Moonbrew Live"
          maker="@sol"
          credit="Remixed from Moonbrew Night by @kai"
          prompt={{ model: third, text: "Turn it into a loud gig poster" }}
        >
          <PosterSite />
        </ChainCard>
      </div>
    </figure>
  );
}

function ChainCard({
  title,
  maker,
  credit,
  prompt,
  children,
  className,
  style,
  tiltClass,
}: {
  title: string;
  maker: string;
  credit: string;
  prompt?: { model: string; text: string };
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  tiltClass?: string;
}) {
  return (
    <div
      className={cn(
        "fan-card group/card relative w-[248px] shrink-0 snap-center [--tilt:0deg] hover:z-40 sm:w-[270px] lg:w-[min(300px,40%)]",
        tiltClass,
        className,
      )}
      style={style}
    >
      {/* The outer box owns the fan-in animation (its transform stays filled), so hover moves
          this inner layer: lift, straighten, grow, glow. */}
      <div className="card-lift relative">
        {prompt ? (
          <div className="card-prompt border-line-strong bg-panel-raised text-fg absolute -top-7 left-4 z-10 flex max-w-[92%] items-center gap-2 rounded-2xl rounded-bl-sm border px-3 py-2 text-[13px] leading-tight shadow-xl shadow-black/40">
            <span className="bg-ink text-cyan shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold">
              {prompt.model}
            </span>
            <span className="truncate">&ldquo;{prompt.text}&rdquo;</span>
          </div>
        ) : null}

        <div className="card-frame border-line-strong bg-panel overflow-hidden rounded-[var(--radius-card)] border shadow-2xl shadow-black/60">
          <div
            className="border-line bg-ink-deep flex items-center gap-1.5 border-b px-3 py-2"
            aria-hidden
          >
            <span className="bg-line-strong size-2 rounded-full" />
            <span className="bg-line-strong size-2 rounded-full" />
            <span className="bg-panel ml-2 h-3.5 flex-1 rounded-full" />
          </div>
          <div className="aspect-[5/6]" aria-hidden>
            {children}
          </div>
          <div className="border-line border-t px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-fg truncate font-bold">
                {title} <span className="text-muted font-normal">by {maker}</span>
              </p>
              <span className="border-line text-muted shrink-0 rounded border px-1.5 text-[11px] font-semibold">
                MIT
              </span>
            </div>
            <p className="text-faint mt-0.5 truncate text-[13px]">{credit}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- The three mini sites. Fixed colors on purpose: they're someone else's designs. --- */

function PastelSite() {
  return (
    <div className="flex h-full flex-col bg-[#ffe7ef] p-4 text-[#4a1d3f]">
      <div className="flex items-center justify-between">
        <span className="font-[Georgia,serif] text-[15px] font-bold italic">moonbrew</span>
        <span className="flex gap-1">
          <span className="h-1 w-5 rounded-full bg-[#4a1d3f]/30" />
          <span className="h-1 w-5 rounded-full bg-[#4a1d3f]/30" />
        </span>
      </div>
      <div className="card-moon relative mx-auto mt-5 size-24 rounded-full bg-[#ffb4a2]">
        <span className="absolute top-3 left-5 size-16 rounded-full bg-[#ffe7ef]" />
      </div>
      <p className="mt-4 font-[Georgia,serif] text-[26px] leading-[1.05] font-bold">
        Coffee after dark
      </p>
      <p className="mt-2 text-[12px] leading-snug text-[#4a1d3f]/70">
        A little van serving oat lattes under the streetlights.
      </p>
      <span className="mt-auto w-fit rounded-full bg-[#4a1d3f] px-4 py-2 text-[12px] font-semibold text-[#ffe7ef]">
        Find the van
      </span>
    </div>
  );
}

function GlassSite() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0b1530] p-4 text-white">
      <span className="card-blob absolute -top-8 -right-6 size-36 rounded-full bg-[#3de8ff]/40 blur-2xl" />
      <span className="card-blob card-blob-2 absolute bottom-6 -left-10 size-40 rounded-full bg-[#8b5cf6]/45 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <span className="text-[14px] font-semibold tracking-wide">moonbrew</span>
        <span className="h-5 w-10 rounded-full border border-white/25 bg-white/10" />
      </div>
      <div className="relative mt-auto rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md">
        <p className="text-[24px] leading-[1.05] font-light">Coffee after dark</p>
        <p className="mt-2 text-[12px] leading-snug text-white/65">
          Oat lattes, neon, and nowhere to be.
        </p>
        <span className="mt-4 inline-block rounded-full border border-[#3de8ff]/70 px-4 py-1.5 text-[12px] text-[#3de8ff]">
          Find the van
        </span>
      </div>
    </div>
  );
}

function PosterSite() {
  return (
    <div className="flex h-full flex-col bg-[#ffe14d] p-4 text-black">
      <div className="flex items-center justify-between border-b-4 border-black pb-2">
        <span className="text-[13px] font-black">MOONBREW</span>
        <span className="text-[11px] font-bold">FRI 9PM</span>
      </div>
      <p className="type-wide mt-4 text-[34px] leading-[0.86] font-black">
        COFFEE
        <br />
        AFTER
        <br />
        DARK
      </p>
      <div className="card-band mt-3 h-6 -rotate-2 bg-[#e8361f]" />
      <span className="mt-auto w-fit bg-black px-4 py-2 text-[12px] font-black text-[#ffe14d]">
        FIND THE VAN
      </span>
    </div>
  );
}
