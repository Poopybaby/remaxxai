import { after, NextResponse, type NextRequest } from "next/server";
import { RATE_LIMITS, UPLOAD_LIMITS } from "@/config/limits";
import { getViewerContext } from "@/lib/auth/viewer";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { blobs } from "@/lib/db/schema";
import { moderate } from "@/lib/moderation";
import { createProject } from "@/lib/projects/create";
import { projectMetadataSchema } from "@/lib/projects/metadata";
import { rateLimit } from "@/lib/ratelimit";
import { refreshSearchIndex } from "@/lib/search/background";
import { sha256Hex } from "@/lib/storage/keys";
import { detectCoverType } from "@/lib/upload/mime";
import { scanFiles } from "@/lib/upload/scan";
import type { RawEntry } from "@/lib/upload/types";
import { validateUpload } from "@/lib/upload/validate";

/**
 * Upload a new project. Multipart body:
 *   metadata  JSON (see lib/projects/metadata.ts)
 *   path, file  repeated, in matching order
 *   cover     raster image
 * Everything the browser already checked is checked again here; the browser is never trusted.
 */
export async function POST(request: NextRequest) {
  const fail = (status: number, error: string, issues?: { path?: string; message: string }[]) =>
    NextResponse.json({ error, issues }, { status });

  const ctx = await getViewerContext();
  if (ctx.status === "anonymous") return fail(401, "Sign in to upload.");
  if (ctx.status === "needs_onboarding") return fail(403, "Finish setting up your profile first.");
  if (!isDbConfigured()) return fail(503, "Uploads aren't set up on this deployment yet.");

  const limit = await rateLimit("upload", ctx.userId, RATE_LIMITS.upload);
  if (!limit.success) return fail(429, "You've uploaded a lot recently. Try again in an hour.");

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > UPLOAD_LIMITS.maxTotalBytes + UPLOAD_LIMITS.coverMaxBytes + 256 * 1024) {
    return fail(413, "This upload is too large.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, "We couldn't read that upload. Try again.");
  }

  // Metadata
  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(String(form.get("metadata") ?? "{}"));
  } catch {
    return fail(400, "Project details are missing.");
  }
  const metadata = projectMetadataSchema.safeParse(metadataJson);
  if (!metadata.success) {
    return fail(
      400,
      "Check the project details.",
      metadata.error.issues.map((i) => ({ path: String(i.path[0] ?? ""), message: i.message })),
    );
  }

  // Files
  const paths = form.getAll("path").map(String);
  const blobsIn = form.getAll("file");
  if (paths.length !== blobsIn.length || paths.length === 0)
    return fail(400, "No files were uploaded.");
  const entries: RawEntry[] = [];
  for (let i = 0; i < paths.length; i++) {
    const item = blobsIn[i];
    if (!(item instanceof Blob)) return fail(400, "One of the files couldn't be read.");
    entries.push({ path: paths[i]!, bytes: new Uint8Array(await item.arrayBuffer()) });
  }
  const validation = validateUpload(entries);
  if (!validation.ok) return fail(400, "Some files need fixing.", validation.issues);

  const scan = scanFiles(validation.files);
  if (scan.blocking.length) {
    return fail(
      400,
      "Remove secrets before uploading.",
      scan.blocking.map((f) => ({ path: f.path, message: f.message })),
    );
  }

  // Cover
  const coverItem = form.get("cover");
  if (!(coverItem instanceof Blob))
    return fail(400, "Add a cover image.", [{ path: "cover", message: "Add a cover image." }]);
  const coverBytes = new Uint8Array(await coverItem.arrayBuffer());
  const coverType = detectCoverType(coverBytes);
  if (!coverType)
    return fail(400, "Covers must be PNG, JPG, WebP or GIF.", [
      { path: "cover", message: "Use a PNG, JPG, WebP or GIF image." },
    ]);
  if (coverBytes.byteLength > UPLOAD_LIMITS.coverMaxBytes) {
    return fail(400, "The cover image is too large.", [
      { path: "cover", message: "Use an image under 2 MB." },
    ]);
  }

  // Moderation of the words and the cover
  const m = metadata.data;
  const verdict = await moderate({
    texts: [m.title, m.description, m.tags.join(" ")],
    imageDataUrls: [`data:${coverType.mime};base64,${Buffer.from(coverBytes).toString("base64")}`],
  });
  if (verdict.verdict === "block")
    return fail(400, "This upload breaks our Acceptable Use Policy.");

  const held = scan.flags.length > 0 || verdict.verdict === "flag";
  const db = getDb();
  const coverSha = await sha256Hex(coverBytes);
  await db
    .insert(blobs)
    .values({ sha256: coverSha, size: coverBytes.byteLength, content: coverBytes })
    .onConflictDoNothing();

  try {
    const project = await createProject(db, {
      ownerId: ctx.userId,
      metadata: m,
      files: validation.files,
      entryPath: validation.entryPath,
      coverUrl: `/media/${coverSha}.${coverType.ext}`,
      status: held ? "pending_review" : "published",
      statusReason: held ? "Held for a quick review before it goes public." : null,
      findings: scan.flags,
      moderation:
        verdict.verdict === "skipped"
          ? { source: "skipped", verdict: "pass", categories: [] }
          : { source: "openai", verdict: verdict.verdict, categories: verdict.categories },
    });
    // Describe and embed it for vibe search once the response is sent (published projects only).
    if (project.status === "published") after(() => refreshSearchIndex([project.id]));
    return NextResponse.json({ slug: project.slug, status: project.status }, { status: 201 });
  } catch (err) {
    console.error("Project upload failed", err);
    return fail(500, "We couldn't save your project. Try again in a moment.");
  }
}
