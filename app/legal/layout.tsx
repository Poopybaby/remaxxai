import Link from "next/link";
import { DraftBanner } from "@/components/legal/draft-banner";

const pages = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/acceptable-use", label: "Acceptable Use Policy" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/dmca", label: "Copyright & DMCA" },
];

export default function LegalLayout({ children }: LayoutProps<"/legal">) {
  return (
    <div className="mx-auto grid w-full max-w-7xl flex-1 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav
        aria-label="Legal documents"
        className="flex flex-row flex-wrap gap-x-5 gap-y-2 text-sm lg:flex-col lg:gap-3"
      >
        {pages.map((p) => (
          <Link key={p.href} href={p.href} className="text-muted hover:text-fg">
            {p.label}
          </Link>
        ))}
      </nav>
      <article className="flex flex-col gap-6">
        <DraftBanner />
        <div className="prose-legal">{children}</div>
      </article>
    </div>
  );
}
