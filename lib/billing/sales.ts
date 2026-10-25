import "server-only";
import { aiAccessMode } from "@/lib/ai/server";
import { canUseAi, type Viewer } from "@/lib/auth/permissions";
import { stripeMode } from "./stripe";

export type SalesState =
  { open: true; testMode: boolean } | { open: false; reason: "payments_off" | "ai_early_access" };

/**
 * Whether this person can buy a plan right now. Plans only make sense if the buyer can use AI,
 * so while AI is admins-only (AI_ACCESS=admins), only admins can subscribe (to test checkout).
 */
export function salesState(viewer: Viewer): SalesState {
  const mode = stripeMode();
  if (mode === "off" || mode === "live-blocked") return { open: false, reason: "payments_off" };
  if (viewer && !canUseAi(viewer, aiAccessMode()))
    return { open: false, reason: "ai_early_access" };
  if (!viewer && aiAccessMode() === "admins") return { open: false, reason: "ai_early_access" };
  return { open: true, testMode: mode === "test" };
}
