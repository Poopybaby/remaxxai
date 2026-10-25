/**
 * The checks every AI request goes through, in order: signed in and allowed (AI_ACCESS), model
 * set up, rate limit, daily caps (per person and site-wide spend), one request at a time,
 * moderation, then the model call with a timeout. Every attempt is logged in ai_messages with
 * tokens and estimated cost, which Phase 5 turns into credits.
 *
 * Dependencies are passed in, so tests run the whole pipeline without network or real keys.
 */
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { AI_LIMITS } from "@/config/limits";
import { estimateCostUsd, type ModelEntry, type ProviderId } from "@/config/models";
import { canUseAi, isAdmin, type AiAccessMode, type Viewer } from "@/lib/auth/permissions";
import { aiMessages, aiSessions } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import type { ModerationVerdict } from "@/lib/moderation";
import {
  friendlyAiError,
  type AiImage,
  type AiMessage,
  type GenerateRequest,
  type GenerateResult,
} from "./providers";

export type PipelineDeps = {
  db: Db;
  generate: (req: GenerateRequest) => Promise<GenerateResult>;
  moderate: (input: { texts?: string[]; imageDataUrls?: string[] }) => Promise<ModerationVerdict>;
  rateLimit: (key: string) => Promise<{ success: boolean }>;
  accessMode: AiAccessMode;
  configuredProviders: ReadonlySet<ProviderId>;
  now?: () => Date;
};

export type PipelineInput = {
  viewer: Viewer;
  kind: "edit" | "explain";
  projectId: string;
  model: ModelEntry;
  /** What the person asked, stored for their history and abuse review. */
  prompt: string;
  images: AiImage[];
  system: string;
  messages: AiMessage[];
};

export type PipelineFailure = {
  ok: false;
  status: number;
  code:
    | "signed_out"
    | "no_access"
    | "model_unavailable"
    | "bad_input"
    | "rate_limited"
    | "daily_limit"
    | "budget"
    | "busy"
    | "moderation"
    | "ai_failed";
  error: string;
};

export type PipelineSuccess = {
  ok: true;
  result: GenerateResult;
  costUsd: number;
  /** The ai_messages row for the reply; finish it with finishReply(). */
  replyId: string;
  sessionId: string | null;
};

const fail = (status: number, code: PipelineFailure["code"], error: string): PipelineFailure => ({
  ok: false,
  status,
  code,
  error,
});

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function getOrCreateSession(
  db: Db,
  userId: string,
  projectId: string,
): Promise<string> {
  await db.insert(aiSessions).values({ userId, projectId }).onConflictDoNothing();
  const [row] = await db
    .select({ id: aiSessions.id })
    .from(aiSessions)
    .where(and(eq(aiSessions.userId, userId), eq(aiSessions.projectId, projectId)));
  return row!.id;
}

/** Earlier turns of this person's conversation about the project, oldest first. */
export async function sessionHistory(
  db: Db,
  sessionId: string,
  turns: number = AI_LIMITS.historyTurns,
): Promise<
  {
    role: "user" | "assistant";
    content: string;
    status: string;
    createdAt: Date;
    modelId: string | null;
  }[]
> {
  const rows = await db
    .select({
      role: aiMessages.role,
      content: aiMessages.content,
      status: aiMessages.status,
      createdAt: aiMessages.createdAt,
      modelId: aiMessages.modelId,
    })
    .from(aiMessages)
    .where(and(eq(aiMessages.sessionId, sessionId), eq(aiMessages.kind, "edit")))
    .orderBy(desc(aiMessages.createdAt))
    .limit(turns * 2);
  return rows.reverse();
}

export async function runAi(
  deps: PipelineDeps,
  input: PipelineInput,
): Promise<PipelineSuccess | PipelineFailure> {
  const { db, viewer, model } = { ...deps, ...input };
  const now = deps.now?.() ?? new Date();

  if (!viewer) return fail(401, "signed_out", "Sign in to use the AI editor.");
  if (!canUseAi(viewer, deps.accessMode)) {
    return fail(403, "no_access", "The AI editor is in early access. It opens to everyone soon.");
  }
  if (!deps.configuredProviders.has(model.provider)) {
    return fail(
      400,
      "model_unavailable",
      `${model.label} isn't set up on this site yet. Pick another model.`,
    );
  }
  if (input.prompt.length > AI_LIMITS.maxPromptChars) {
    return fail(400, "bad_input", `Keep requests under ${AI_LIMITS.maxPromptChars} characters.`);
  }
  if (input.images.length > AI_LIMITS.maxImages) {
    return fail(400, "bad_input", `Attach up to ${AI_LIMITS.maxImages} images.`);
  }
  if (input.images.length && !model.vision) {
    return fail(
      400,
      "bad_input",
      `${model.label} can't read images. Remove them or pick another model.`,
    );
  }

  if (!(await deps.rateLimit(viewer.userId)).success) {
    return fail(
      429,
      "rate_limited",
      "That's a lot of requests in a minute. Wait a moment and try again.",
    );
  }

  const dayStart = startOfUtcDay(now);
  const [mine] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.userId, viewer.userId),
        eq(aiMessages.role, "assistant"),
        gte(aiMessages.createdAt, dayStart),
      ),
    );
  const dailyCap = isAdmin(viewer) ? AI_LIMITS.adminPerDay : AI_LIMITS.perDay;
  if ((mine?.n ?? 0) >= dailyCap) {
    return fail(
      429,
      "daily_limit",
      `You've reached today's limit of ${dailyCap} AI requests. It resets at midnight UTC.`,
    );
  }
  const [spend] = await db
    .select({ usd: sql<number>`coalesce(sum(${aiMessages.costUsd}), 0)::float` })
    .from(aiMessages)
    .where(gte(aiMessages.createdAt, dayStart));
  if ((spend?.usd ?? 0) >= AI_LIMITS.dailyBudgetUsd) {
    return fail(
      503,
      "budget",
      "The AI editor is resting for today. It comes back at midnight UTC.",
    );
  }
  const [inFlight] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.userId, viewer.userId),
        eq(aiMessages.status, "pending"),
        gte(aiMessages.createdAt, new Date(now.getTime() - AI_LIMITS.staleAfterMs)),
      ),
    );
  if ((inFlight?.n ?? 0) > 0) {
    return fail(409, "busy", "Your last request is still running. Wait for it to finish.");
  }

  const sessionId =
    input.kind === "edit" ? await getOrCreateSession(db, viewer.userId, input.projectId) : null;
  const base = {
    userId: viewer.userId,
    projectId: input.projectId,
    sessionId,
    kind: input.kind,
    modelId: model.id,
  };

  const verdict = await deps.moderate({
    texts: [input.prompt],
    imageDataUrls: input.images.map((i) => `data:${i.mime};base64,${i.base64}`),
  });
  if (verdict.verdict === "block" || verdict.verdict === "flag") {
    await db.insert(aiMessages).values({
      ...base,
      role: "user",
      content: input.prompt.slice(0, 4000),
      status: "blocked",
      error: `moderation: ${verdict.categories.join(", ")}`.slice(0, 500),
      imageCount: input.images.length,
    });
    return fail(
      422,
      "moderation",
      "That request can't be run here. Check the Acceptable Use Policy and try something else.",
    );
  }

  await db.insert(aiMessages).values({
    ...base,
    role: "user",
    content: input.prompt.slice(0, 4000),
    imageCount: input.images.length,
  });
  const [reply] = await db
    .insert(aiMessages)
    .values({ ...base, role: "assistant", status: "pending" })
    .returning({ id: aiMessages.id });
  const replyId = reply!.id;

  const limits = AI_LIMITS[input.kind];
  try {
    const result = await deps.generate({
      model,
      system: input.system,
      messages: input.messages,
      maxOutputTokens: limits.maxOutputTokens,
      timeoutMs: limits.timeoutMs,
    });
    const costUsd = estimateCostUsd(model, result.inputTokens, result.outputTokens);
    await db
      .update(aiMessages)
      .set({ inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd })
      .where(eq(aiMessages.id, replyId));
    return { ok: true, result, costUsd, replyId, sessionId };
  } catch (err) {
    const message = friendlyAiError(err, model.label);
    await db
      .update(aiMessages)
      .set({
        status: "error",
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        content: message,
      })
      .where(eq(aiMessages.id, replyId));
    return fail(502, "ai_failed", message);
  }
}

/** Marks a reply finished with what the person sees (a summary, never full file contents). */
export async function finishReply(
  db: Db,
  replyId: string,
  update: { content: string; status?: "ok" | "error"; error?: string | null },
): Promise<void> {
  await db
    .update(aiMessages)
    .set({
      content: update.content.slice(0, 4000),
      status: update.status ?? "ok",
      error: update.error ?? null,
    })
    .where(eq(aiMessages.id, replyId));
}

/** Links an accepted edit to the version it produced. */
export async function linkReplyToVersion(
  db: Db,
  userId: string,
  replyId: string,
  versionId: string,
): Promise<void> {
  await db
    .update(aiMessages)
    .set({ resultVersionId: versionId })
    .where(and(eq(aiMessages.id, replyId), eq(aiMessages.userId, userId)));
}

/** Today's usage for the admin page. */
export async function usageToday(db: Db, now = new Date()) {
  const rows = await db
    .select({
      modelId: aiMessages.modelId,
      requests: sql<number>`count(*)::int`,
      costUsd: sql<number>`coalesce(sum(${aiMessages.costUsd}), 0)::float`,
      errors: sql<number>`count(*) filter (where ${aiMessages.status} = 'error')::int`,
    })
    .from(aiMessages)
    .where(and(eq(aiMessages.role, "assistant"), gte(aiMessages.createdAt, startOfUtcDay(now))))
    .groupBy(aiMessages.modelId)
    .orderBy(asc(aiMessages.modelId));
  return rows;
}
