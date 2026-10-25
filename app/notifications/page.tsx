import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { listNotifications, markAllRead, type NotificationItem } from "@/lib/notifications";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-12 sm:px-6">
      <h1 className="type-wide text-4xl font-black">Notifications</h1>
      <Suspense
        fallback={<div className="bg-panel h-64 rounded-[var(--radius-card)]" aria-hidden />}
      >
        <List />
      </Suspense>
    </section>
  );
}

const ago = (d: Date) => {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} d ago`;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(d);
};

function describe(n: NotificationItem): { text: React.ReactNode; href: string } {
  const who = n.actor ? <strong className="text-fg">{n.actor.displayName}</strong> : "Someone";
  const title = n.project ? <strong className="text-fg">{n.project.title}</strong> : "your project";
  const projectHref = n.project ? `/p/${n.project.slug}` : "/drafts";
  switch (n.kind) {
    case "like":
      return {
        text: (
          <>
            {who} liked {title}
          </>
        ),
        href: projectHref,
      };
    case "follow":
      return { text: <>{who} followed you</>, href: n.actor ? `/u/${n.actor.handle}` : "/" };
    case "remix":
      return {
        text: (
          <>
            {who} published a remix of your work: {title}
          </>
        ),
        href: projectHref,
      };
    case "approved":
      return { text: <>{title} passed review and is now in the gallery</>, href: projectHref };
    case "removed":
      return {
        text: (
          <>
            {title} was taken down{n.note ? `: ${n.note}` : "."}
          </>
        ),
        href: projectHref,
      };
  }
}

async function List() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/notifications");
  if (!isDbConfigured()) return null;
  const db = getDb();
  const items = await listNotifications(db, viewer.userId);
  // Seen now: clear the unread badge once this page has been sent.
  if (items.some((n) => !n.read)) after(() => markAllRead(db, viewer));

  if (items.length === 0) {
    return (
      <div className="border-line-strong flex min-h-56 flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed p-8 text-center">
        <p className="text-fg font-semibold">Nothing yet</p>
        <p className="text-muted max-w-[44ch] text-sm">
          When people like, remix or follow your work, you&apos;ll see it here.
        </p>
        <Link href="/create" className={buttonClasses("secondary", "sm", "mt-1")}>
          Create something
        </Link>
      </div>
    );
  }

  return (
    <ul className="border-line divide-line flex flex-col divide-y rounded-[var(--radius-card)] border">
      {items.map((n) => {
        const { text, href } = describe(n);
        return (
          <li key={n.id}>
            <Link
              href={href}
              className={cn(
                "hover:bg-panel flex items-start gap-3 px-4 py-3.5",
                !n.read && "bg-magenta/5",
              )}
            >
              {n.actor ? (
                <Avatar
                  name={n.actor.displayName}
                  handle={n.actor.handle}
                  src={n.actor.avatarUrl}
                  size={36}
                />
              ) : (
                <span
                  aria-hidden
                  className="bg-panel-raised text-muted grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold"
                >
                  R
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-muted text-[15px]">{text}</span>
                <span className="text-faint text-xs">{ago(n.createdAt)}</span>
              </span>
              {!n.read ? (
                <span className="bg-magenta mt-2 size-2 shrink-0 rounded-full" aria-label="New" />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
