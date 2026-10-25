import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Viewer } from "@/lib/auth/permissions";
import { approveProject, removeProject } from "@/lib/moderation/actions";
import type { ModerationVerdict } from "@/lib/moderation";
import { listNotifications, markAllRead, unreadCount } from "@/lib/notifications";
import { createProfile } from "@/lib/profiles";
import { publishDraft } from "@/lib/projects/publish";
import { createRemix } from "@/lib/projects/remix";
import { setFollow, setLike } from "@/lib/projects/social";
import { buildSeedSql, seedUuid } from "@/lib/seed/build-sql";
import { createAuthUser, createTestDb, type TestDb } from "../helpers/db";

let t: TestDb;
let maker: Viewer; // owns a published project
let fan: Viewer;
const admin = { userId: "", role: "admin" as const };
const pass = {
  moderate: async (): Promise<ModerationVerdict> => ({
    verdict: "pass",
    categories: [],
    source: "openai",
  }),
};
let makerProject = "";

async function makeUser(handle: string, role: "user" | "admin" = "user"): Promise<Viewer> {
  const id = await createAuthUser(t.pg);
  await createProfile(t.db, id, {
    handle,
    displayName: handle,
    ageConfirmed: true,
    termsAccepted: true,
  });
  if (role === "admin") await t.pg.exec(`update profiles set role = 'admin' where id = '${id}'`);
  return { userId: id, role };
}

const meta = (title: string) => ({
  title,
  description: "",
  category: "landing-page",
  toolUsed: "remaxx",
  licenseId: "mit",
  styles: [],
  tags: [],
  rightsConfirmed: true,
});

const kinds = async (userId: string) => (await listNotifications(t.db, userId)).map((n) => n.kind);

beforeAll(async () => {
  t = await createTestDb();
  await t.pg.exec(await buildSeedSql());
  maker = await makeUser("maker");
  fan = await makeUser("fan");
  admin.userId = (await makeUser("boss", "admin"))!.userId;
  // The maker publishes a remix of a seed project, so they own something public.
  const draft = await createRemix(t.db, maker, seedUuid("project:moonbrew"));
  await publishDraft(
    t.db,
    maker,
    draft.id,
    { metadata: meta("Maker's moonbrew"), cover: null },
    pass,
  );
  makerProject = draft.id;
});
afterAll(async () => {
  await t.close();
});

describe("notifications", () => {
  it("tells a maker about a like once, even after unlike and like again", async () => {
    await setLike(t.db, fan, makerProject, true);
    await setLike(t.db, fan, makerProject, false);
    await setLike(t.db, fan, makerProject, true);
    expect(await kinds(maker!.userId)).toEqual(["like"]);
    // Liking your own work isn't news.
    await setLike(t.db, maker, makerProject, true);
    expect(await kinds(maker!.userId)).toEqual(["like"]);
  });

  it("tells someone when they get a follower", async () => {
    await setFollow(t.db, fan, maker!.userId, true);
    await setFollow(t.db, fan, maker!.userId, false);
    await setFollow(t.db, fan, maker!.userId, true);
    expect((await kinds(maker!.userId)).filter((k) => k === "follow")).toHaveLength(1);
    const [n] = await listNotifications(t.db, maker!.userId);
    expect(n?.actor?.handle).toBe("fan");
  });

  it("tells a maker when someone publishes a remix of their work, not when they start one", async () => {
    const draft = await createRemix(t.db, fan, makerProject);
    expect(await kinds(maker!.userId)).not.toContain("remix");
    await publishDraft(t.db, fan, draft.id, { metadata: meta("Fan's take"), cover: null }, pass);
    const remixNote = (await listNotifications(t.db, maker!.userId)).find(
      (n) => n.kind === "remix",
    );
    expect(remixNote?.project?.title).toBe("Fan's take");
  });

  it("tells the owner when a review approves or removes their project", async () => {
    const draft = await createRemix(t.db, fan, seedUuid("project:tip-split"));
    await publishDraft(
      t.db,
      fan,
      draft.id,
      { metadata: meta("Held one"), cover: null },
      {
        moderate: async () => ({ verdict: "flag", categories: ["harassment"], source: "openai" }),
      },
    );
    expect((await approveProject(t.db, admin, draft.id)).ok).toBe(true);
    expect(await kinds(fan!.userId)).toContain("approved");

    await removeProject(t.db, admin, draft.id, { copyright: false, note: "Spam" });
    const removed = (await listNotifications(t.db, fan!.userId)).find((n) => n.kind === "removed");
    expect(removed?.note).toBeTruthy();
  });

  it("counts unread and marks everything read", async () => {
    expect(await unreadCount(t.db, maker!.userId)).toBeGreaterThan(0);
    await markAllRead(t.db, maker);
    expect(await unreadCount(t.db, maker!.userId)).toBe(0);
    // Only the recipient's own are touched.
    expect(await unreadCount(t.db, fan!.userId)).toBeGreaterThan(0);
  });
});
