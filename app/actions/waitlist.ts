"use server";

import { headers } from "next/headers";
import { RATE_LIMITS } from "@/config/limits";
import { getDb, isDbConfigured } from "@/lib/db/client";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { joinWaitlist } from "@/lib/waitlist";

export type WaitlistState = { status: "idle" | "success" | "error"; message: string };

export async function joinWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "");

  const ip = clientIp(await headers());
  const limit = await rateLimit("waitlist", ip, RATE_LIMITS.waitlist);
  if (!limit.success) {
    return {
      status: "error",
      message: "Too many tries from this network. Wait a few minutes and try again.",
    };
  }

  if (!isDbConfigured()) {
    console.error("Waitlist signup failed: DATABASE_URL is not set");
    return { status: "error", message: "The waitlist isn't open yet. Check back soon." };
  }

  try {
    const result = await joinWaitlist(getDb(), email);
    if (!result.ok) return { status: "error", message: result.error };
    return {
      status: "success",
      message: "You're on the list. We'll email you when your invite is ready.",
    };
  } catch (err) {
    console.error("Waitlist signup failed", err);
    return { status: "error", message: "We couldn't save your email. Try again in a moment." };
  }
}
