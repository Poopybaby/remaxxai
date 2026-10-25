/**
 * The two AI features, built on the pipeline:
 *  - proposeEdit: the person describes a change; the model's answer is parsed and applied to a
 *    copy of their files and returned as a reviewable set of changes. Nothing is saved until they
 *    accept, which goes through saveVersion like any other save.
 *  - explainVersion: "Break it down". Cached per version and model, so each write-up is paid for
 *    once and then free to read for everyone who can see the project.
 */
import { asc, eq } from "drizzle-orm";
import { getModel, type ModelEntry } from "@/config/models";
import { canOpenInEditor, canViewProject, type Viewer } from "@/lib/auth/permissions";
import { explanations, projectFiles, projects, projectVersions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { loadEditorFiles } from "@/lib/projects/versions";
import { typeFor } from "@/lib/upload/mime";
import { normalizePath } from "@/lib/upload/validate";
import {
  applyEditOps,
  EDIT_SYSTEM_PROMPT,
  EXPLAIN_SYSTEM_PROMPT,
  formatProjectFiles,
  parseEditResponse,
  ProjectTooLargeError,
  type FileChange,
} from "./edit-protocol";
import { getEntitlement } from "@/lib/billing/credits";
import {
  finishReply,
  getOrCreateSession,
  refundCharge,
  runAi,
  sessionHistory,
  type PipelineDeps,
  type PipelineFailure,
} from "./pipeline";
import type { AiImage, AiMessage } from "./providers";

const MAX_WORKING_CHARS = 2_000_000;

export type ProposeEditInput = {
  viewer: Viewer;
  projectId: string;
  baseVersionId: string;
  /** The editor's current text files, including unsaved changes. */
  files: Record<string, string>;
  prompt: string;
  images: AiImage[];
  modelId: string;
};

export type ProposedEdit = {
  ok: true;
  replyId: string;
  summary: string;
  changes: FileChange[];
  problems: string[];
  costUsd: number;
  credits: { charged: number; balance: number; trialPrompts: number };
};

const failure = (
  status: number,
  code: PipelineFailure["code"],
  error: string,
): PipelineFailure => ({
  ok: false,
  status,
  code,
  error,
});

export async function proposeEdit(
  deps: PipelineDeps,
  input: ProposeEditInput,
): Promise<ProposedEdit | PipelineFailure> {
  const { db } = deps;
  const model = getModel(input.modelId);
  if (!model) return failure(400, "bad_input", "Pick a model.");
  const prompt = input.prompt.trim();
  if (!prompt) return failure(400, "bad_input", "Describe the change you want.");

  const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId));
  if (!project || !canOpenInEditor(input.viewer, project)) {
    return failure(404, "bad_input", "That draft isn't available.");
  }
  if (project.currentVersionId !== input.baseVersionId) {
    return failure(
      409,
      "bad_input",
      "This draft changed in another tab. Reload to get the latest version.",
    );
  }

  // Binary files come from the saved version, not from the browser.
  const saved = await db
    .select({ path: projectFiles.path })
    .from(projectFiles)
    .where(eq(projectFiles.versionId, input.baseVersionId));
  const binaryPaths = saved.map((f) => f.path).filter((p) => !typeFor(p)?.text);

  const files: Record<string, string> = {};
  let chars = 0;
  for (const [rawPath, text] of Object.entries(input.files)) {
    const n = normalizePath(rawPath);
    if (!n.ok || !typeFor(n.path)?.text || typeof text !== "string") {
      return failure(400, "bad_input", `The editor sent a file it shouldn't have: ${rawPath}`);
    }
    chars += text.length;
    files[n.path] = text;
  }
  if (chars > MAX_WORKING_CHARS)
    return failure(413, "bad_input", "This project is too big for AI edits.");

  let projectText: string;
  try {
    projectText = formatProjectFiles(files, binaryPaths, project.entryPath);
  } catch (err) {
    if (err instanceof ProjectTooLargeError) return failure(413, "bad_input", err.message);
    throw err;
  }

  // Earlier turns give the model context ("make it darker again"), without old code.
  const sessionId = await getOrCreateSession(db, input.viewer!.userId, project.id);
  const history: AiMessage[] = [];
  for (const h of await sessionHistory(db, sessionId)) {
    if (h.status !== "ok" || !h.content) continue;
    const last = history[history.length - 1];
    if (last?.role === h.role) last.text += `\n${h.content}`;
    else history.push({ role: h.role, text: h.content });
  }
  if (history[0]?.role === "assistant") history.shift();
  if (history[history.length - 1]?.role === "user") history.pop();

  const imageNote = input.images.length
    ? `\n\nThe person attached ${input.images.length} image${input.images.length > 1 ? "s" : ""} for reference.`
    : "";
  const run = await runAi(deps, {
    viewer: input.viewer,
    kind: "edit",
    projectId: project.id,
    model,
    prompt,
    images: input.images,
    system: EDIT_SYSTEM_PROMPT,
    messages: [
      ...history,
      {
        role: "user",
        text: `Current project files:\n\n${projectText}\n\nRequest:${imageNote}\n${prompt}`,
        images: input.images,
      },
    ],
  });
  if (!run.ok) return run;

  const parsed = parseEditResponse(run.result.text);
  const applied = applyEditOps(files, parsed.ops, { binaryPaths, entryPath: project.entryPath });
  const problems = [...applied.problems];
  if (parsed.incomplete.length || run.result.finish === "length") {
    problems.push(
      `The answer was cut off before it finished${parsed.incomplete.length ? ` (${parsed.incomplete.join(", ")})` : ""}. Try asking for a smaller change.`,
    );
  }
  const summary =
    parsed.summary ||
    (applied.changes.length ? "Here are the changes." : "The model didn't suggest any changes.");
  // A reply that tried to change files but produced nothing usable counts as a failed request.
  const attempted = parsed.ops.length > 0 || parsed.incomplete.length > 0;
  const failed = attempted && applied.changes.length === 0;
  await finishReply(db, run.replyId, {
    content: summary,
    status: failed ? "error" : "ok",
    error: failed ? problems.join(" ").slice(0, 500) || "No usable changes" : null,
  });
  // Nothing usable came back: the person isn't charged for it.
  let credits = run.credits;
  if (failed) {
    await refundCharge(db, input.viewer!.userId, run.replyId, run.payment);
    const after = await getEntitlement(db, input.viewer!.userId);
    credits = { charged: 0, balance: after.balance, trialPrompts: after.trialPrompts };
    problems.push("You weren't charged for this one.");
  }
  return {
    ok: true,
    replyId: run.replyId,
    summary,
    changes: applied.changes,
    problems,
    costUsd: run.costUsd,
    credits,
  };
}

// ── Break it down ────────────────────────────────────────────────────────────

export type Explanation = {
  ok: true;
  content: string;
  modelId: string;
  cached: boolean;
  /** Present when this request generated (and paid for) a new explanation. */
  credits?: { charged: number; balance: number; trialPrompts: number };
};

export async function getCachedExplanation(
  db: Db,
  versionId: string,
): Promise<{ content: string; modelId: string } | null> {
  const [row] = await db
    .select({ content: explanations.content, modelId: explanations.modelId })
    .from(explanations)
    .where(eq(explanations.versionId, versionId))
    .orderBy(asc(explanations.createdAt))
    .limit(1);
  return row ?? null;
}

export async function explainVersion(
  deps: PipelineDeps,
  input: { viewer: Viewer; versionId: string; modelId: string },
): Promise<Explanation | PipelineFailure> {
  const { db } = deps;
  const model: ModelEntry | undefined = getModel(input.modelId);
  if (!model) return failure(400, "bad_input", "Pick a model.");

  const [row] = await db
    .select({ project: projects, versionId: projectVersions.id })
    .from(projectVersions)
    .innerJoin(projects, eq(projects.id, projectVersions.projectId))
    .where(eq(projectVersions.id, input.versionId));
  if (!row || !canViewProject(input.viewer, row.project)) {
    return failure(404, "bad_input", "That project isn't available.");
  }

  // Any saved write-up of this version will do, whichever model wrote it.
  const hit = await getCachedExplanation(db, input.versionId);
  if (hit) return { ok: true, content: hit.content, modelId: hit.modelId, cached: true };

  const all = await loadEditorFiles(db, input.versionId);
  const text: Record<string, string> = {};
  for (const f of all) if (f.text !== null) text[f.path] = f.text;
  let projectText: string;
  try {
    projectText = formatProjectFiles(
      text,
      all.filter((f) => f.text === null).map((f) => f.path),
      row.project.entryPath,
      120_000,
    );
  } catch (err) {
    if (err instanceof ProjectTooLargeError)
      return failure(413, "bad_input", "This project is too big to explain right now.");
    throw err;
  }

  const prompt = `Break down “${row.project.title}”`;
  const run = await runAi(deps, {
    viewer: input.viewer,
    kind: "explain",
    projectId: row.project.id,
    model,
    prompt,
    images: [],
    system: EXPLAIN_SYSTEM_PROMPT,
    messages: [{ role: "user", text: `Project: ${row.project.title}\n\n${projectText}` }],
  });
  if (!run.ok) return run;

  const content = run.result.text.trim().slice(0, 20_000);
  await db
    .insert(explanations)
    .values({
      versionId: input.versionId,
      modelId: model.id,
      content,
      createdBy: input.viewer!.userId,
    })
    .onConflictDoNothing();
  await finishReply(db, run.replyId, { content: `Explained ${row.project.title}` });
  return { ok: true, content, modelId: model.id, cached: false, credits: run.credits };
}
