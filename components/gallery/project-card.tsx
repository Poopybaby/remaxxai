import Image from "next/image";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import type { ProjectStatus } from "@/lib/db/schema";
import type { ProjectCard as BaseCard } from "@/lib/projects/queries";
import type { MatchReason } from "@/lib/search/rank";
import { LicenseBadge } from "./license-badge";

type Card = BaseCard & { reasons?: MatchReason[] };

const STATUS_LABEL: Partial<Record<ProjectStatus, string>> = {
  pending_review: "In review",
  unpublished: "Hidden",
  removed: "Removed",
  hidden_pending_review: "Under review",
  draft: "Draft",
};

export function ProjectCard({
  card,
  status,
  priority,
}: {
  card: Card;
  status?: ProjectStatus;
  priority?: boolean;
}) {
  const label = status ? STATUS_LABEL[status] : undefined;
  return (
    <article className="group relative flex flex-col gap-3">
      <Link
        href={`/p/${card.slug}`}
        className="border-line bg-panel group-hover:border-line-strong relative block aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] border transition-colors"
      >
        {card.coverUrl ? (
          <Image
            src={card.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1280px) 320px, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover object-top"
            priority={priority}
          />
        ) : (
          <div className="text-faint grid size-full place-items-center text-sm">No cover</div>
        )}
        {label ? (
          <span className="bg-ink/90 text-fg absolute top-2.5 left-2.5 rounded-md px-2 py-1 text-xs font-semibold">
            {label}
          </span>
        ) : null}
        <span className="sr-only">{card.title}</span>
      </Link>
      <div className="flex flex-col gap-1.5 px-0.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-fg line-clamp-1 font-bold">
            <Link href={`/p/${card.slug}`} className="hover:underline">
              {card.title}
            </Link>
          </h3>
          <LicenseBadge id={card.licenseId} />
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <Link
            href={`/u/${card.owner.handle}`}
            className="text-muted hover:text-fg flex min-w-0 items-center gap-2"
          >
            <Avatar
              name={card.owner.displayName}
              handle={card.owner.handle}
              src={card.owner.avatarUrl}
              size={22}
            />
            <span className="truncate">{card.owner.displayName}</span>
          </Link>
          <span className="text-faint flex shrink-0 items-center gap-3">
            {card.isStaffPick ? <span className="text-magenta">Staff pick</span> : null}
            {card.isRemix ? <span className="text-cyan">Remix</span> : null}
            <span aria-label={`${card.likeCount} likes`} className="flex items-center gap-1">
              <HeartIcon /> {card.likeCount}
            </span>
          </span>
        </div>
        {card.reasons?.length ? <Reasons reasons={card.reasons} /> : null}
      </div>
    </article>
  );
}

function reasonText(r: MatchReason): string {
  switch (r.kind) {
    case "tag":
      return `#${r.label}`;
    case "title":
      return `“${r.label}” in title`;
    case "text":
      return `mentions “${r.label}”`;
    case "tool":
      return `Made with ${r.label}`;
    default:
      return r.label;
  }
}

/** Why a search result or similar project was picked. */
function Reasons({ reasons }: { reasons: MatchReason[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <span className="sr-only">Matched on:</span>
      {reasons.map((r) => (
        <span
          key={`${r.kind}:${r.label}`}
          className={
            r.kind === "vibe"
              ? "border-cyan/40 text-cyan rounded-full border px-2 py-0.5 text-xs font-semibold"
              : "border-line text-muted rounded-full border px-2 py-0.5 text-xs"
          }
        >
          {r.kind === "vibe" ? "✦ " : ""}
          {reasonText(r)}
        </span>
      ))}
    </div>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-3.5 fill-current" aria-hidden>
      <path d="M10 17.3 8.8 16.2C4.6 12.4 2 10 2 7.1 2 4.7 3.9 2.8 6.3 2.8c1.4 0 2.7.6 3.7 1.7 1-1.1 2.3-1.7 3.7-1.7 2.4 0 4.3 1.9 4.3 4.3 0 2.9-2.6 5.3-6.8 9.1L10 17.3z" />
    </svg>
  );
}

export function ProjectGrid({
  cards,
  statuses,
}: {
  cards: Card[];
  statuses?: Map<string, ProjectStatus>;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cards.map((c, i) => (
        <ProjectCard key={c.id} card={c} status={statuses?.get(c.id)} priority={i < 4} />
      ))}
    </div>
  );
}
