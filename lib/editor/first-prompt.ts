/**
 * Create → editor hand-off through sessionStorage (this tab only, cleared once read).
 * A plain string is a description to show in the prompt box; a `send` hand-off is a prompt the
 * person already sent on the Create page, so the editor sends it as soon as it opens.
 */
export const firstPromptKey = (projectId: string) => `remaxx:first-prompt:${projectId}`;

export type Handoff = {
  prompt: string;
  /** Send straight away (the person clicked Send on Create) instead of just filling the box. */
  send: boolean;
  modelId?: string;
  images?: { base64: string }[];
};

export function encodeHandoff(h: Handoff): string {
  return JSON.stringify({ v: 1, ...h });
}

export function parseHandoff(raw: string): Handoff | null {
  const text = raw.trim();
  if (!text) return null;
  if (!text.startsWith("{")) return { prompt: text.slice(0, 2000), send: false };
  try {
    const o = JSON.parse(text) as Record<string, unknown>;
    if (o.v !== 1 || typeof o.prompt !== "string" || !o.prompt.trim()) return null;
    const images = Array.isArray(o.images)
      ? o.images
          .filter(
            (i): i is { base64: string } => typeof (i as { base64?: unknown })?.base64 === "string",
          )
          .slice(0, 3)
      : [];
    return {
      prompt: o.prompt.slice(0, 2000),
      send: o.send === true,
      modelId: typeof o.modelId === "string" ? o.modelId : undefined,
      images,
    };
  } catch {
    return null;
  }
}
