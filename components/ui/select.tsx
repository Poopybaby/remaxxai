import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

/** Native select, styled. Native keeps it accessible and good on phones. */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          "border-line bg-ink-deep text-fg hover:border-line-strong focus-visible:border-cyan aria-[invalid=true]:border-danger h-11 w-full appearance-none rounded-[var(--radius-control)] border pr-10 pl-3.5 text-[15px] transition-colors focus-visible:outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="fill-muted pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      >
        <path
          d="M5.5 7.5 10 12l4.5-4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
          className="stroke-muted"
        />
      </svg>
    </div>
  );
}

/** A toggleable pill, used for multi-select style choices and filters. */
export function Chip({
  selected,
  className,
  ...props
}: ComponentProps<"button"> & { selected: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors",
        selected
          ? "border-magenta bg-magenta/15 text-fg"
          : "border-line bg-panel text-muted hover:border-line-strong hover:text-fg",
        className,
      )}
      {...props}
    />
  );
}
