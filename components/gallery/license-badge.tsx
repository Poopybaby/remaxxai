import { LICENSES, type LicenseId } from "@/config/licenses";
import { cn } from "@/lib/utils/cn";

export function LicenseBadge({ id, className }: { id: LicenseId; className?: string }) {
  const l = LICENSES[id];
  return (
    <span
      title={l.name}
      className={cn(
        "border-line text-muted inline-flex h-6 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-semibold",
        className,
      )}
    >
      {l.shortName}
    </span>
  );
}
