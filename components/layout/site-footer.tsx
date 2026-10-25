import Link from "next/link";

const links = [
  { href: "/pricing", label: "Pricing" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/acceptable-use", label: "Acceptable use" },
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/dmca", label: "Copyright & DMCA" },
];

export function SiteFooter() {
  return (
    <footer className="border-line/70 border-t">
      <div className="text-faint mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Every template on REMAXX is shared under a license its creator chose.</p>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-fg">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
