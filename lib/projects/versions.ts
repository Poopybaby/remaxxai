/**
 * Draft versions for the editor. Every save, accepted AI edit and restore makes a new numbered
 * version; old versions are never changed, so undo is just "restore the previous one".
 */
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { UPLOAD_LIMITS } from "@/config/limits";
import { assert, canOpenInEditor, type Viewer } from "@/lib/auth/permissions";
import { blobs, projectFiles, projects, projectVersions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { sha256Hex } from "@/lib/storage/keys";
import { typeFor } from "@/lib/upload/mime";
import { scanFiles } from "@/lib/upload/scan";
import type { ScanFinding } from "@/lib/upload/types";
import { normalizePath } from "@/lib/upload/validate";

export type VersionCreator = "user" | "ai" | "system";

/** A file in a save request: new text content, or an unchanged file kept by its hash. */
export type SaveFile = { path: string; text: string } | { path: string; sha256: string };

export type VersionSummary = {
  id: string;
  number: number;
  message: string;
  createdBy: VersionCreator;
  fileCount: number;
  createdAt: Date;
};

export type EditorFile = {
  path: string;
  sha256: string;
  size: number;
  mime: string;
  /** Contents for text files; binary files are fetched separately when needed. */
  text: string | null;
};

export class SaveError extends Error {
  constructor(
    message: string,
    readonly code: "conflict" | "invalid" | "blocked" | "not_found" = "invalid",
  ) {
    super(message);
    this.name = "SaveError";
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();

async function loadEditable(db: Db, viewer: Viewer, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new SaveError("That project doesn't exist.", "not_found");
  assert(canOpenInEditor(viewer, project), "Only the owner can edit this draft.");
  return project;
}

async function versionFiles(db: Db, versionId: string) {
  return db
    .select({
      path: projectFiles.path,
      sha256: projectFiles.blobSha256,
      size: projectFiles.size,
      mime: projectFiles.mime,
    })
    .from(projectFiles)
    .where(eq(projectFiles.versionId, versionId))
    .orderBy(asc(projectFiles.path));
}

/** Every file of a version, with text contents included, for opening in the editor. */
export async function loadEditorFiles(db: Db, versionId: string): Promise<EditorFile[]> {
  const rows = await db
    .select({
      path: projectFiles.path,
      sha256: projectFiles.blobSha256,
      size: projectFiles.size,
      mime: projectFiles.mime,
      content: blobs.content,
    })
    .from(projectFiles)
    .innerJoin(blobs, eq(blobs.sha256, projectFiles.blobSha256))
    .where(eq(projectFiles.versionId, versionId))
    .orderBy(asc(projectFiles.path));
  return rows.map((r) => ({
    path: r.path,
    sha256: r.sha256,
    size: r.size,
    mime: r.mime,
    text: typeFor(r.path)?.text && r.content ? dec.decode(r.content) : null,
  }));
}

export async function listVersions(
  db: Db,
  viewer: Viewer,
  projectId: string,
): Promise<VersionSummary[]> {
  await loadEditable(db, viewer, projectId);
  const rows = await db
    .select()
    .from(projectVersions)
    .where(eq(projectVersions.projectId, projectId))
    .orderBy(desc(projectVersions.number))
    .limit(200);
  return rows.map((v) => ({
    id: v.id,
    number: v.number,
    message: v.message,
    createdBy: v.createdBy as VersionCreator,
    fileCount: v.fileCount,
    createdAt: v.createdAt,
  }));
}

export type SaveResult = {
  version: VersionSummary;
  /** False when nothing changed, so no new version was made. */
  changed: boolean;
  /** Scanner flags: allowed in a private draft, checked again at publish. */
  warnings: ScanFinding[];
};

/**
 * Saves the editor's files as a new version. `baseVersionId` must still be the draft's current
 * version, so two tabs can't silently overwrite each other. Unchanged files are referenced by
 * hash, and only hashes from this draft's own history are accepted.
 */
export async function saveVersion(
  db: Db,
  viewer: Viewer,
  projectId: string,
  input: { baseVersionId: string; files: SaveFile[]; message: string; createdBy: VersionCreator },
): Promise<SaveResult> {
  const project = await loadEditable(db, viewer, projectId);
  if (project.currentVersionId !== input.baseVersionId) {
    throw new SaveError(
      "This draft changed in another tab or window. Reload to get the latest version.",
      "conflict",
    );
  }
  if (input.files.length === 0) throw new SaveError("A project needs at least one file.");
  if (input.files.length > UPLOAD_LIMITS.maxFiles) {
    throw new SaveError(`Projects can have at most ${UPLOAD_LIMITS.maxFiles} files.`);
  }

  // Hashes this draft may reuse: anything in any of its own versions.
  const known = await db
    .selectDistinct({
      sha256: projectFiles.blobSha256,
      size: projectFiles.size,
      mime: projectFiles.mime,
    })
    .from(projectFiles)
    .innerJoin(projectVersions, eq(projectVersions.id, projectFiles.versionId))
    .where(eq(projectVersions.projectId, projectId));
  const knownBySha = new Map(known.map((k) => [k.sha256, k]));

  type Row = { path: string; sha256: string; size: number; mime: string; bytes?: Uint8Array };
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const f of input.files) {
    const n = normalizePath(f.path);
    if (!n.ok) throw new SaveError(`${f.path}: ${n.message}`);
    const key = n.path.toLowerCase();
    if (seen.has(key)) throw new SaveError(`Two files are named ${n.path}.`);
    seen.add(key);
    const type = typeFor(n.path);
    if (!type) throw new SaveError(`${n.path}: that file type isn't supported.`);

    if ("text" in f) {
      if (!type.text) throw new SaveError(`${n.path}: only text files can be edited here.`);
      const bytes = enc.encode(f.text);
      if (bytes.byteLength > UPLOAD_LIMITS.maxFileBytes) {
        throw new SaveError(`${n.path} is too large.`);
      }
      rows.push({
        path: n.path,
        sha256: await sha256Hex(bytes),
        size: bytes.byteLength,
        mime: type.mime,
        bytes,
      });
    } else {
      const k = knownBySha.get(f.sha256);
      if (!k) throw new SaveError(`${n.path}: that file isn't part of this project.`);
      rows.push({ path: n.path, sha256: f.sha256, size: k.size, mime: type.mime });
    }
  }
  if (!rows.some((r) => r.path === project.entryPath)) {
    throw new SaveError(`Keep ${project.entryPath}: it's the page the preview opens.`);
  }
  const totalBytes = rows.reduce((s, r) => s + r.size, 0);
  if (totalBytes > UPLOAD_LIMITS.maxTotalBytes) {
    throw new SaveError("The project is over the size limit. Remove something large.");
  }

  // Nothing changed: hand back the current version instead of making a duplicate.
  const base = await versionFiles(db, input.baseVersionId);
  const sameAsBase =
    base.length === rows.length &&
    rows.every((r) => base.some((b) => b.path === r.path && b.sha256 === r.sha256));
  if (sameAsBase) {
    const [current] = await db
      .select()
      .from(projectVersions)
      .where(eq(projectVersions.id, input.baseVersionId));
    return { version: toSummary(current!), changed: false, warnings: [] };
  }

  const textFiles = rows
    .filter((r) => r.bytes)
    .map((r) => ({ path: r.path, bytes: r.bytes!, mime: r.mime, isText: true }));
  const scan = scanFiles(textFiles);
  if (scan.blocking.length) {
    throw new SaveError(scan.blocking.map((b) => `${b.path}: ${b.message}`).join(" "), "blocked");
  }

  const version = await db.transaction(async (tx) => {
    const fresh = rows.filter((r) => r.bytes);
    if (fresh.length) {
      await tx
        .insert(blobs)
        .values(fresh.map((r) => ({ sha256: r.sha256, size: r.size, content: r.bytes! })))
        .onConflictDoNothing({ target: blobs.sha256 });
    }
    const [{ n } = { n: 0 }] = await tx
      .select({ n: max(projectVersions.number) })
      .from(projectVersions)
      .where(eq(projectVersions.projectId, projectId));
    const [v] = await tx
      .insert(projectVersions)
      .values({
        projectId,
        number: (n ?? 0) + 1,
        message: input.message.trim().slice(0, 200) || "Saved",
        createdBy: input.createdBy,
        fileCount: rows.length,
        totalBytes,
      })
      .returning();
    await tx.insert(projectFiles).values(
      rows.map((r) => ({
        versionId: v!.id,
        path: r.path,
        blobSha256: r.sha256,
        size: r.size,
        mime: r.mime,
      })),
    );
    // Only advance if nobody else did in the meantime.
    const moved = await tx
      .update(projects)
      .set({ currentVersionId: v!.id })
      .where(and(eq(projects.id, projectId), eq(projects.currentVersionId, input.baseVersionId)))
      .returning({ id: projects.id });
    if (moved.length === 0) {
      throw new SaveError(
        "This draft changed while saving. Reload to get the latest version.",
        "conflict",
      );
    }
    return v!;
  });

  return { version: toSummary(version), changed: true, warnings: scan.flags };
}

/** Makes a new version with the same files as an older one. Nothing is deleted. */
export async function restoreVersion(
  db: Db,
  viewer: Viewer,
  projectId: string,
  versionId: string,
): Promise<SaveResult> {
  const project = await loadEditable(db, viewer, projectId);
  const [target] = await db
    .select()
    .from(projectVersions)
    .where(and(eq(projectVersions.id, versionId), eq(projectVersions.projectId, projectId)));
  if (!target) throw new SaveError("That version doesn't exist.", "not_found");
  const files = await versionFiles(db, versionId);
  return saveVersion(db, viewer, projectId, {
    baseVersionId: project.currentVersionId!,
    files: files.map((f) => ({ path: f.path, sha256: f.sha256 })),
    message: `Restored version ${target.number}`,
    createdBy: "user",
  });
}

/** Deletes a draft entirely. Published projects are never deleted this way. */
export async function deleteDraft(db: Db, viewer: Viewer, projectId: string): Promise<void> {
  await loadEditable(db, viewer, projectId);
  await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.status, "draft")));
}

function toSummary(v: typeof projectVersions.$inferSelect): VersionSummary {
  return {
    id: v.id,
    number: v.number,
    message: v.message,
    createdBy: v.createdBy as VersionCreator,
    fileCount: v.fileCount,
    createdAt: v.createdAt,
  };
}

/** Which versions belong to a project; used to check ids passed in from the browser. */
export async function versionBelongsTo(
  db: Db,
  projectId: string,
  versionIds: string[],
): Promise<boolean> {
  if (versionIds.length === 0) return true;
  const rows = await db
    .select({ id: projectVersions.id })
    .from(projectVersions)
    .where(and(eq(projectVersions.projectId, projectId), inArray(projectVersions.id, versionIds)));
  return rows.length === new Set(versionIds).size;
}
