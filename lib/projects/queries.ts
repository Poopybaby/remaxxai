/** Read queries for the gallery. Callers apply permission checks (see lib/auth/permissions). */
import { and, asc, desc, eq, exists, ilike, or, sql, type SQL } from "drizzle-orm";
import { isLicenseId, type LicenseId } from "@/config/licenses";
import {
  blobs,
  collectionItems,
  collections,
  follows,
  likes,
  licenses,
  profiles,
  projectFiles,
  projects,
  projectTags,
  projectVersions,
  tags,
  type ProjectStatus,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export const PAGE_SIZE = 24;

export type ProjectCard = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  category: string;
  toolUsed: string;
  licenseId: LicenseId;
  likeCount: number;
  remixCount: number;
  isRemix: boolean;
  owner: { handle: string; displayName: string; avatarUrl: string | null };
};

export type ExploreFilters = {
  q?: string;
  category?: string;
  tool?: string;
  license?: string;
  style?: string;
  sort?: "new" | "popular";
  page?: number;
};

const cardColumns = {
  id: projects.id,
  slug: projects.slug,
  title: projects.title,
  coverUrl: projects.coverUrl,
  category: projects.category,
  toolUsed: projects.toolUsed,
  licenseId: projects.licenseId,
  likeCount: projects.likeCount,
  remixCount: projects.remixCount,
  parentProjectId: projects.parentProjectId,
  ownerHandle: profiles.handle,
  ownerName: profiles.displayName,
  ownerAvatar: profiles.avatarUrl,
};

type CardRow = {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  category: string;
  toolUsed: string;
  licenseId: string;
  likeCount: number;
  remixCount: number;
  parentProjectId: string | null;
  ownerHandle: string;
  ownerName: string;
  ownerAvatar: string | null;
};

function toCard(r: CardRow): ProjectCard {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    coverUrl: r.coverUrl,
    category: r.category,
    toolUsed: r.toolUsed,
    licenseId: isLicenseId(r.licenseId) ? r.licenseId : "remaxx-personal",
    likeCount: r.likeCount,
    remixCount: r.remixCount,
    isRemix: r.parentProjectId !== null,
    owner: { handle: r.ownerHandle, displayName: r.ownerName, avatarUrl: r.ownerAvatar },
  };
}

function hasTag(slug: string): SQL {
  return exists(
    sql`(select 1 from ${projectTags} join ${tags} on ${tags.id} = ${projectTags.tagId}
         where ${projectTags.projectId} = ${projects.id} and ${tags.slug} = ${slug})`,
  );
}

/** Escapes LIKE wildcards so a search for "100%" matches literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listPublishedProjects(
  db: Db,
  filters: ExploreFilters,
): Promise<{ cards: ProjectCard[]; hasMore: boolean }> {
  const conditions: SQL[] = [eq(projects.status, "published")];
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const pattern = likePattern(q);
    conditions.push(
      or(
        ilike(projects.title, pattern),
        ilike(projects.description, pattern),
        exists(
          sql`(select 1 from ${projectTags} join ${tags} on ${tags.id} = ${projectTags.tagId}
               where ${projectTags.projectId} = ${projects.id} and ${tags.slug} ilike ${pattern})`,
        ),
      )!,
    );
  }
  if (filters.category) conditions.push(eq(projects.category, filters.category));
  if (filters.tool) conditions.push(eq(projects.toolUsed, filters.tool));
  if (filters.license) conditions.push(eq(projects.licenseId, filters.license));
  if (filters.style) conditions.push(hasTag(filters.style));

  const page = Math.max(1, Math.min(filters.page ?? 1, 100));
  const order =
    filters.sort === "popular"
      ? [desc(projects.likeCount), desc(projects.remixCount), desc(projects.publishedAt)]
      : [desc(projects.publishedAt), desc(projects.id)];

  const rows = await db
    .select(cardColumns)
    .from(projects)
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .where(and(...conditions))
    .orderBy(...order)
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  return { cards: rows.slice(0, PAGE_SIZE).map(toCard), hasMore: rows.length > PAGE_SIZE };
}

/** A person's projects. Owners see their own non-public projects too. */
export async function listProjectsByOwner(
  db: Db,
  ownerId: string,
  opts: { includeHidden: boolean },
): Promise<(ProjectCard & { status: ProjectStatus })[]> {
  const rows = await db
    .select({ ...cardColumns, status: projects.status })
    .from(projects)
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .where(
      and(
        eq(projects.ownerId, ownerId),
        opts.includeHidden ? sql`${projects.status} <> 'draft'` : eq(projects.status, "published"),
      ),
    )
    .orderBy(desc(projects.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...toCard(r), status: r.status }));
}

export async function listSavedProjects(db: Db, userId: string): Promise<ProjectCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(collectionItems)
    .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
    .innerJoin(projects, eq(projects.id, collectionItems.projectId))
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .where(
      and(
        eq(collections.ownerId, userId),
        eq(collections.isDefault, true),
        eq(projects.status, "published"),
      ),
    )
    .orderBy(desc(collectionItems.createdAt))
    .limit(200);
  return rows.map(toCard);
}

export type ProjectDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: ProjectStatus;
  statusReason: string | null;
  category: string;
  toolUsed: string;
  license: { id: LicenseId; name: string; url: string };
  coverUrl: string | null;
  entryPath: string;
  currentVersionId: string | null;
  likeCount: number;
  saveCount: number;
  remixCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  owner: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  tags: { slug: string; kind: "style" | "topic" }[];
};

export async function getProjectBySlug(db: Db, slug: string): Promise<ProjectDetail | null> {
  const [row] = await db
    .select({
      p: projects,
      ownerHandle: profiles.handle,
      ownerName: profiles.displayName,
      ownerAvatar: profiles.avatarUrl,
      licenseName: licenses.name,
      licenseUrl: licenses.url,
    })
    .from(projects)
    .innerJoin(profiles, eq(profiles.id, projects.ownerId))
    .innerJoin(licenses, eq(licenses.id, projects.licenseId))
    .where(eq(projects.slug, slug));
  if (!row) return null;

  const tagRows = await db
    .select({ slug: tags.slug, kind: tags.kind })
    .from(projectTags)
    .innerJoin(tags, eq(tags.id, projectTags.tagId))
    .where(eq(projectTags.projectId, row.p.id))
    .orderBy(asc(tags.kind), asc(tags.slug));

  const p = row.p;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    status: p.status,
    statusReason: p.statusReason,
    category: p.category,
    toolUsed: p.toolUsed,
    license: {
      id: isLicenseId(p.licenseId) ? p.licenseId : "remaxx-personal",
      name: row.licenseName,
      url: row.licenseUrl,
    },
    coverUrl: p.coverUrl,
    entryPath: p.entryPath,
    currentVersionId: p.currentVersionId,
    likeCount: p.likeCount,
    saveCount: p.saveCount,
    remixCount: p.remixCount,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    owner: {
      id: p.ownerId,
      handle: row.ownerHandle,
      displayName: row.ownerName,
      avatarUrl: row.ownerAvatar,
    },
    tags: tagRows,
  };
}

export type FileEntry = { path: string; size: number; mime: string };

export async function listVersionFiles(db: Db, versionId: string): Promise<FileEntry[]> {
  return db
    .select({ path: projectFiles.path, size: projectFiles.size, mime: projectFiles.mime })
    .from(projectFiles)
    .where(eq(projectFiles.versionId, versionId))
    .orderBy(asc(projectFiles.path));
}

/** A file's bytes plus the owning project's access info, for permission checks by the caller. */
export async function getVersionFile(
  db: Db,
  versionId: string,
  path: string,
): Promise<{ bytes: Uint8Array; mime: string; ownerId: string; status: ProjectStatus } | null> {
  const [row] = await db
    .select({
      content: blobs.content,
      mime: projectFiles.mime,
      ownerId: projects.ownerId,
      status: projects.status,
    })
    .from(projectFiles)
    .innerJoin(projectVersions, eq(projectVersions.id, projectFiles.versionId))
    .innerJoin(projects, eq(projects.id, projectVersions.projectId))
    .innerJoin(blobs, eq(blobs.sha256, projectFiles.blobSha256))
    .where(and(eq(projectFiles.versionId, versionId), eq(projectFiles.path, path)));
  if (!row || !row.content) return null;
  return { bytes: row.content, mime: row.mime, ownerId: row.ownerId, status: row.status };
}

/** Whether the viewer liked/saved this project and follows its owner. */
export async function getViewerProjectState(
  db: Db,
  viewerId: string,
  projectId: string,
  ownerId: string,
): Promise<{ liked: boolean; saved: boolean; following: boolean }> {
  const [liked, saved, following] = await Promise.all([
    db
      .select({ x: sql`1` })
      .from(likes)
      .where(and(eq(likes.userId, viewerId), eq(likes.projectId, projectId))),
    db
      .select({ x: sql`1` })
      .from(collectionItems)
      .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
      .where(
        and(
          eq(collections.ownerId, viewerId),
          eq(collections.isDefault, true),
          eq(collectionItems.projectId, projectId),
        ),
      ),
    db
      .select({ x: sql`1` })
      .from(follows)
      .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, ownerId))),
  ]);
  return { liked: liked.length > 0, saved: saved.length > 0, following: following.length > 0 };
}

export async function getFollowCounts(
  db: Db,
  userId: string,
): Promise<{ followers: number; following: number }> {
  const [row] = await db
    .select({
      followers: sql<number>`(select count(*)::int from ${follows} where ${follows.followeeId} = ${userId})`,
      following: sql<number>`(select count(*)::int from ${follows} where ${follows.followerId} = ${userId})`,
    })
    .from(sql`(select 1) as one`);
  return { followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0) };
}

/** Image blobs by hash, for serving covers. Only raster images are ever returned. */
export async function getImageBlob(db: Db, sha256: string): Promise<Uint8Array | null> {
  const [row] = await db
    .select({ content: blobs.content })
    .from(blobs)
    .where(eq(blobs.sha256, sha256));
  return row?.content ?? null;
}
