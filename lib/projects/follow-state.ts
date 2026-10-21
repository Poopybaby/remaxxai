import { and, eq } from "drizzle-orm";
import { follows } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export async function getViewerFollowState(
  db: Db,
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  const rows = await db
    .select({ x: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, targetId)));
  return rows.length > 0;
}
