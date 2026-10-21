import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("wordmark inline-block leading-none", className)}
      aria-label="REMAXX home"
    >
      REMAXX
    </Link>
  );
}
