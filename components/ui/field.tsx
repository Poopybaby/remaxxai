import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const control =
  "w-full rounded-[var(--radius-control)] border border-line bg-ink-deep px-3.5 text-[15px] text-fg placeholder:text-faint transition-colors hover:border-line-strong focus-visible:border-cyan focus-visible:outline-none aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-fg text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-faint text-sm">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  id,
  name,
  children,
  error,
  defaultChecked,
}: {
  id: string;
  name: string;
  children: ReactNode;
  error?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={id}
        className="text-muted flex cursor-pointer items-start gap-3 text-[15px] leading-snug"
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          value="on"
          defaultChecked={defaultChecked}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="border-line-strong accent-magenta mt-0.5 size-5 shrink-0 cursor-pointer rounded"
        />
        <span>{children}</span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-danger pl-8 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
