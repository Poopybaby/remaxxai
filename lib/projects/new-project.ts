/**
 * "Create": a new private draft from one of the starters, owned by the person, with no remix
 * lineage (it's their own work). They pick the license when they publish.
 */
import { and, count, eq } from "drizzle-orm";
import { assert, type Viewer } from "@/lib/auth/permissions";
import { projects, type Project } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { typeFor } from "@/lib/upload/mime";
import { createProject } from "./create";
import { MAX_DRAFTS_PER_USER, RemixError } from "./remix";
import { STARTERS, titleFromIdea, type StarterId } from "./starters";

export async function createFromStarter(
  db: Db,
  viewer: Viewer,
  input: { starter: StarterId; idea?: string },
): Promise<Project> {
  assert(viewer !== null, "Sign in to create a project.");
  const starter = STARTERS[input.starter];
  const [drafts] = await db
    .select({ n: count() })
    .from(projects)
    .where(and(eq(projects.ownerId, viewer.userId), eq(projects.status, "draft")));
  if ((drafts?.n ?? 0) >= MAX_DRAFTS_PER_USER) {
    throw new RemixError(
      `You have ${MAX_DRAFTS_PER_USER} drafts. Delete or publish some before starting another.`,
    );
  }
  const enc = new TextEncoder();
  return createProject(db, {
    ownerId: viewer.userId,
    metadata: {
      title: titleFromIdea(input.idea ?? "", `My ${starter.name.toLowerCase()}`),
      description: "",
      category: starter.category,
      toolUsed: "remaxx",
      licenseId: "mit",
      styles: [],
      tags: [],
      rightsConfirmed: true,
    },
    files: Object.entries(starter.files).map(([path, text]) => ({
      path,
      bytes: enc.encode(text),
      mime: typeFor(path)?.mime ?? "text/plain",
      isText: true,
    })),
    entryPath: "index.html",
    coverUrl: null,
    status: "draft",
    statusReason: null,
    parentProjectId: null,
    createdBy: "system",
  });
}
