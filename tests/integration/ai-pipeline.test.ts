import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_LIMITS } from "@/config/limits";
import { getModel, type ModelEntry, type ProviderId } from "@/config/models";
import { runAi, type PipelineDeps, type PipelineInput } from "@/lib/ai/pipeline";
import { AiError, type GenerateRequest, type GenerateResult } from "@/lib/ai/providers";
import { explainVersion, proposeEdit } from "@/lib/ai/services";
import type { Viewer } from "@/lib/auth/permissions";
import { aiMessages, explanations } from "@/lib/db/schema";
import type { ModerationVerdict } from "@/lib/moderation";
import { createProfile } from "@/lib/profiles";
import { createRemix } from "@/lib/projects/remix";
import { loadEditorFiles, saveVersion } from "@/lib/projects/versions";
import { buildSeedSql, seedUuid } from "@/lib/seed/build-sql";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let admin: Viewer;
let user: Viewer;
const pid = (slug: string) => seedUuid(`project:${slug}`);

async function makeUser(handle: string, role: "user" | "admin"): Promise<Viewer> {
  const id = await createAuthUser(t.pg);
  const res = await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (!res.ok) throw new Error(JSON.stringify(res.errors));
  if (role === "admin") await t.pg.query("update profiles set role = 'admin' where id = $1", [id]);
  return { userId: id, role };
}

type Fake = {
  deps: PipelineDeps;
  calls: GenerateRequest[];
  reply: (text: string | Error, usage?: Partial<GenerateResult>) => void;
  setModeration: (v: ModerationVerdict["verdict"]) => void;
  setRateLimited: (v: boolean) => void;
};

function fakeDeps(opts: { access?: "admins" | "signed-in"; providers?: ProviderId[] } = {}): Fake {
  const calls: GenerateRequest[] = [];
  let next: string | Error = "SUMMARY: ok";
  let usage: Partial<GenerateResult> = {};
  let verdict: ModerationVerdict["verdict"] = "pass";
  let limited = false;
  return {
    calls,
    reply: (text, u = {}) => {
      next = text;
      usage = u;
    },
    setModeration: (v) => (verdict = v),
    setRateLimited: (v) => (limited = v),
    deps: {
      db: t.db,
      generate: async (req) => {
        calls.push(req);
        if (next instanceof Error) throw next;
        return { text: next, inputTokens: 1000, outputTokens: 200, finish: "stop", ...usage };
      },
      moderate: async () => ({
        verdict,
        categories: verdict === "pass" ? [] : ["harassment"],
        source: "openai",
      }),
      rateLimit: async () => ({ success: !limited }),
      accessMode: opts.access ?? "admins",
      configuredProviders: new Set(opts.providers ?? ["anthropic", "openai", "google"]),
    },
  };
}

const sonnet = getModel("claude-sonnet") as ModelEntry;
const input = (viewer: Viewer, extra: Partial<PipelineInput> = {}): PipelineInput => ({
  viewer,
  kind: "explain",
  projectId: pid("moonbrew"),
  model: sonnet,
  prompt: "hello",
  images: [],
  system: "SYS",
  messages: [{ role: "user", text: "hello" }],
  ...extra,
});

beforeAll(async () => {
  t = await createTestDb();
  await t.pg.exec(await buildSeedSql());
  admin = await makeUser("boss", "admin");
  user = await makeUser("pat", "user");
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.db.delete(aiMessages);
});

describe("runAi checks", () => {
  it("needs a signed-in person with access", async () => {
    const f = fakeDeps();
    expect(await runAi(f.deps, input(null))).toMatchObject({
      ok: false,
      code: "signed_out",
      status: 401,
    });
    expect(await runAi(f.deps, input(user))).toMatchObject({
      ok: false,
      code: "no_access",
      status: 403,
    });
    expect(await runAi(fakeDeps({ access: "signed-in" }).deps, input(user))).toMatchObject({
      ok: true,
    });
    expect(f.calls).toHaveLength(0);
  });

  it("refuses models without a key, oversized prompts, and images for text-only models", async () => {
    const f = fakeDeps({ providers: ["openai"] });
    expect(await runAi(f.deps, input(admin))).toMatchObject({ code: "model_unavailable" });
    const g = fakeDeps({ providers: ["deepseek", "anthropic"] });
    expect(
      await runAi(g.deps, input(admin, { prompt: "x".repeat(AI_LIMITS.maxPromptChars + 1) })),
    ).toMatchObject({ code: "bad_input" });
    expect(
      await runAi(
        g.deps,
        input(admin, {
          model: getModel("deepseek")!,
          images: [{ mime: "image/png", base64: "AA" }],
        }),
      ),
    ).toMatchObject({ code: "bad_input" });
    expect(g.calls).toHaveLength(0);
  });

  it("applies the per-minute rate limit", async () => {
    const f = fakeDeps();
    f.setRateLimited(true);
    expect(await runAi(f.deps, input(admin))).toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("stops at the daily cap per person", async () => {
    const f = fakeDeps({ access: "signed-in" });
    await t.pg.query(
      `insert into ai_messages (user_id, kind, role, status) select $1, 'edit', 'assistant', 'ok' from generate_series(1, $2)`,
      [user!.userId, AI_LIMITS.perDay],
    );
    expect(await runAi(f.deps, input(user))).toMatchObject({ code: "daily_limit" });
    // Admins have a higher cap.
    expect(await runAi(f.deps, input(admin))).toMatchObject({ ok: true });
  });

  it("pauses for everyone once the site's daily budget is spent", async () => {
    const f = fakeDeps();
    await t.db.insert(aiMessages).values({
      userId: user!.userId,
      kind: "edit",
      role: "assistant",
      costUsd: AI_LIMITS.dailyBudgetUsd,
    });
    expect(await runAi(f.deps, input(admin))).toMatchObject({ code: "budget", status: 503 });
  });

  it("runs one request at a time per person", async () => {
    const f = fakeDeps();
    await t.db
      .insert(aiMessages)
      .values({ userId: admin!.userId, kind: "edit", role: "assistant", status: "pending" });
    expect(await runAi(f.deps, input(admin))).toMatchObject({ code: "busy", status: 409 });
  });

  it("blocks flagged prompts before calling a model, and logs the attempt", async () => {
    const f = fakeDeps();
    f.setModeration("flag");
    expect(await runAi(f.deps, input(admin, { prompt: "something nasty" }))).toMatchObject({
      code: "moderation",
    });
    expect(f.calls).toHaveLength(0);
    const [row] = await t.db.select().from(aiMessages).where(eq(aiMessages.userId, admin!.userId));
    expect(row).toMatchObject({ role: "user", status: "blocked", content: "something nasty" });
  });

  it("logs tokens and cost on success", async () => {
    const f = fakeDeps();
    const res = await runAi(f.deps, input(admin));
    expect(res).toMatchObject({ ok: true, costUsd: (1000 * 2 + 200 * 10) / 1e6 });
    const rows = await t.db.select().from(aiMessages).where(eq(aiMessages.role, "assistant"));
    expect(rows[0]).toMatchObject({
      inputTokens: 1000,
      outputTokens: 200,
      modelId: "claude-sonnet",
      status: "pending",
    });
  });

  it("turns provider failures into a friendly message and logs the real reason", async () => {
    const f = fakeDeps();
    f.reply(new AiError("timeout", "Timed out after 110s"));
    const res = await runAi(f.deps, input(admin));
    expect(res).toMatchObject({
      ok: false,
      code: "ai_failed",
      error: "Claude Sonnet took too long. Try a smaller change, or another model.",
    });
    const [row] = await t.db.select().from(aiMessages).where(eq(aiMessages.role, "assistant"));
    expect(row).toMatchObject({ status: "error", error: "Timed out after 110s" });
  });
});

describe("proposeEdit", () => {
  it("returns reviewable changes without saving anything, then the accepted result saves as an AI version", async () => {
    const draft = await createRemix(t.db, admin, pid("moonbrew"));
    const files = await loadEditorFiles(t.db, draft.currentVersionId!);
    const text = Object.fromEntries(
      files.filter((f) => f.text !== null).map((f) => [f.path, f.text!]),
    );
    const html = text[draft.entryPath]!;
    const firstLine = html.split("\n").find((l) => l.includes("<title>"))!;

    const f = fakeDeps();
    f.reply(
      `SUMMARY: Renamed the page title.\n<<<EDIT path="${draft.entryPath}">>>\n<<<<<<< SEARCH\n${firstLine}\n=======\n  <title>Sunbrew</title>\n>>>>>>> REPLACE\n<<<END>>>`,
    );
    const res = await proposeEdit(f.deps, {
      viewer: admin,
      projectId: draft.id,
      baseVersionId: draft.currentVersionId!,
      files: text,
      prompt: "rename it Sunbrew",
      images: [],
      modelId: "claude-sonnet",
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.summary).toBe("Renamed the page title.");
    expect(res.changes).toHaveLength(1);
    expect(res.changes[0]).toMatchObject({ path: draft.entryPath, kind: "modified" });
    expect(res.changes[0]!.after).toContain("<title>Sunbrew</title>");
    // The model saw the files and the request; binary files are named, not sent.
    expect(f.calls[0]!.messages.at(-1)!.text).toContain(`<<<FILE path="${draft.entryPath}">>>`);
    expect(f.calls[0]!.messages.at(-1)!.text).toContain("rename it Sunbrew");

    const saved = await saveVersion(t.db, admin, draft.id, {
      baseVersionId: draft.currentVersionId!,
      files: files.map((x) =>
        x.path === draft.entryPath
          ? { path: x.path, text: res.changes[0]!.after }
          : { path: x.path, sha256: x.sha256 },
      ),
      message: res.summary,
      createdBy: "ai",
    });
    expect(saved.version.createdBy).toBe("ai");

    // A follow-up request carries the earlier prompt and summary, not the old code.
    await t.db.update(aiMessages).set({ status: "ok" }).where(eq(aiMessages.status, "pending"));
    f.reply("SUMMARY: Nothing to change.");
    await proposeEdit(f.deps, {
      viewer: admin,
      projectId: draft.id,
      baseVersionId: saved.version.id,
      files: { ...text, [draft.entryPath]: res.changes[0]!.after },
      prompt: "now make it darker",
      images: [],
      modelId: "claude-sonnet",
    });
    const history = f.calls[1]!.messages;
    expect(history.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(history[0]!.text).toBe("rename it Sunbrew");
    expect(history[1]!.text).toBe("Renamed the page title.");
  });

  it("only works on the person's own draft at its current version", async () => {
    const draft = await createRemix(t.db, admin, pid("tip-split"));
    const f = fakeDeps({ access: "signed-in" });
    const base = {
      projectId: draft.id,
      baseVersionId: draft.currentVersionId!,
      files: {},
      prompt: "x",
      images: [],
      modelId: "claude-sonnet",
    };
    expect(await proposeEdit(f.deps, { ...base, viewer: user })).toMatchObject({
      ok: false,
      status: 404,
    });
    expect(
      await proposeEdit(f.deps, { ...base, viewer: admin, projectId: pid("moonbrew") }),
    ).toMatchObject({ ok: false, status: 404 });
    expect(
      await proposeEdit(f.deps, { ...base, viewer: admin, baseVersionId: pid("moonbrew") }),
    ).toMatchObject({ ok: false, status: 409 });
    expect(
      await proposeEdit(f.deps, { ...base, viewer: admin, files: { "../x.html": "x" } }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(f.calls).toHaveLength(0);
  });

  it("reports answers that were cut off, and logs a reply that changed nothing as an error", async () => {
    const draft = await createRemix(t.db, admin, pid("color-lab"));
    const files = await loadEditorFiles(t.db, draft.currentVersionId!);
    const text = Object.fromEntries(
      files.filter((x) => x.text !== null).map((x) => [x.path, x.text!]),
    );
    const f = fakeDeps();
    f.reply(`SUMMARY: Rewrote it.\n<<<WRITE path="${draft.entryPath}">>>\n<html>half`, {
      finish: "length",
    });
    const res = await proposeEdit(f.deps, {
      viewer: admin,
      projectId: draft.id,
      baseVersionId: draft.currentVersionId!,
      files: text,
      prompt: "rewrite everything",
      images: [],
      modelId: "claude-sonnet",
    });
    if (!res.ok) throw new Error(res.error);
    expect(res.changes).toEqual([]);
    expect(res.problems.at(-1)).toMatch(/cut off/);
    const [row] = await t.db
      .select()
      .from(aiMessages)
      .where(and(eq(aiMessages.role, "assistant"), eq(aiMessages.projectId, draft.id)));
    expect(row?.status).toBe("error");
  });
});

describe("explainVersion", () => {
  it("explains once, then serves the cached write-up to anyone who can see the project", async () => {
    const [ledger] = await t.pg
      .query<{ v: string }>("select current_version_id as v from projects where id = $1", [
        pid("ledgerline"),
      ])
      .then((r) => r.rows);
    const f = fakeDeps();
    f.reply("## What it is\nA dashboard.");
    const first = await explainVersion(f.deps, {
      viewer: admin,
      versionId: ledger!.v,
      modelId: "claude-haiku",
    });
    expect(first).toMatchObject({
      ok: true,
      cached: false,
      content: "## What it is\nA dashboard.",
    });
    expect(f.calls[0]!.messages[0]!.text).toContain("<<<FILE");

    // Someone without AI access still gets the cached explanation for free.
    const second = await explainVersion(f.deps, {
      viewer: user,
      versionId: ledger!.v,
      modelId: "claude-haiku",
    });
    expect(second).toMatchObject({ ok: true, cached: true });
    expect(f.calls).toHaveLength(1);
    expect(await t.db.select().from(explanations)).toHaveLength(1);
  });

  it("won't explain someone else's private draft", async () => {
    const draft = await createRemix(t.db, admin, pid("dev-docs"));
    const f = fakeDeps({ access: "signed-in" });
    expect(
      await explainVersion(f.deps, {
        viewer: user,
        versionId: draft.currentVersionId!,
        modelId: "claude-haiku",
      }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
