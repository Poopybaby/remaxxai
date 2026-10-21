import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/ui/avatar";
import { getPublicProfile } from "@/lib/profiles-public";

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) return { title: "Profile not found" };
  return {
    title: `${profile.displayName} (@${profile.handle})`,
    description: profile.bio || `Templates and remixes by @${profile.handle} on REMAXX.`,
  };
}

export default function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent params={params} />
    </Suspense>
  );
}

async function ProfileContent({ params }: Pick<PageProps<"/u/[handle]">, "params">) {
  const { handle } = await params;
  const profile = await getPublicProfile(handle);
  if (!profile) notFound();

  const joined = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(profile.joinedAt),
  );
  const websiteLabel = profile.websiteUrl?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar
          name={profile.displayName}
          handle={profile.handle}
          src={profile.avatarUrl}
          size={88}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="type-wide truncate text-3xl font-black sm:text-4xl">
            {profile.displayName}
          </h1>
          <p className="text-muted">@{profile.handle}</p>
          {profile.bio ? (
            <p className="text-fg max-w-[60ch] leading-relaxed">{profile.bio}</p>
          ) : null}
          <p className="text-faint flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>Joined {joined}</span>
            {profile.websiteUrl ? (
              <a
                href={profile.websiteUrl}
                rel="noopener noreferrer nofollow ugc"
                target="_blank"
                className="text-muted hover:text-fg underline underline-offset-4"
              >
                {websiteLabel}
              </a>
            ) : null}
          </p>
        </div>
      </header>

      <div className="border-line-strong flex min-h-56 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed p-8 text-center">
        <p className="text-fg font-semibold">No templates yet</p>
        <p className="text-muted max-w-[44ch] text-sm">
          Templates and remixes from @{profile.handle} will show up here once uploads open.
        </p>
      </div>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <section
      className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6"
      aria-busy
    >
      <div className="flex items-center gap-5">
        <div className="bg-panel size-22 rounded-full" />
        <div className="flex flex-col gap-2">
          <div className="bg-panel h-8 w-56 rounded" />
          <div className="bg-panel h-4 w-28 rounded" />
        </div>
      </div>
      <div className="bg-panel min-h-56 rounded-[var(--radius-card)]" />
    </section>
  );
}
