import { z } from "zod";
import { waitlist } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

const emailSchema = z.email({ message: "Enter a valid email address." }).max(254);

export type WaitlistResult = { ok: true } | { ok: false; error: string };

/**
 * Adds an email to the waitlist. Joining twice is not an error and returns the same result,
 * so the form never reveals whether an address is already on the list.
 */
export async function joinWaitlist(
  db: Db,
  rawEmail: string,
  source = "landing",
): Promise<WaitlistResult> {
  const parsed = emailSchema.safeParse(rawEmail.trim().toLowerCase());
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };
  await db
    .insert(waitlist)
    .values({ email: parsed.data, source })
    .onConflictDoNothing({ target: waitlist.email });
  return { ok: true };
}
