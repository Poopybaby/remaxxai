import Link from "next/link";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { id: "overview", href: "/admin", label: "Overview" },
  { id: "users", href: "/admin/users", label: "Users" },
] as const;

export function AdminNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <nav aria-label="Admin" className="flex gap-1">
      {LINKS.map((l) => (
        <Link
          key={l.id}
          href={l.href}
          aria-current={l.id === current ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-semibold",
            l.id === current ? "bg-panel text-fg" : "text-muted hover:bg-panel hover:text-fg",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
