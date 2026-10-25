/**
 * Credit estimates, shared by the server (holds) and the editor (the "about N credits" note).
 * Pure: no database, safe in the browser.
 */
import { creditsForCost } from "@/config/plans";

type Priced = { inputPerMTok: number; outputPerMTok: number };

/** Rough token count from characters (code averages ~3.5 characters per token). */
export const tokensFromChars = (chars: number) => Math.ceil(chars / 3.5);

const TYPICAL_OUTPUT = { edit: 2500, explain: 900 } as const;

export type CreditEstimate = { typical: number; max: number };

/**
 * What a request will probably cost (`typical`, shown before sending) and at most (`max`,
 * the hold). Input is known from the prompt and files; output is the unknown part.
 */
export function estimateCredits(
  model: Priced,
  kind: "edit" | "explain",
  inputChars: number,
  maxOutputTokens: number,
): CreditEstimate {
  const input = tokensFromChars(inputChars) + 1200; // + system prompt and formatting
  const cost = (out: number) =>
    (input * model.inputPerMTok + out * model.outputPerMTok) / 1_000_000;
  return {
    typical: creditsForCost(cost(TYPICAL_OUTPUT[kind])),
    max: creditsForCost(cost(maxOutputTokens)),
  };
}
