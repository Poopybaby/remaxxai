/** Fixed vocabularies for gallery filters. Free-form tags are allowed in addition to these. */

export const TOOLS = [
  { id: "claude", label: "Claude" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "gemini", label: "Gemini" },
  { id: "deepseek", label: "DeepSeek" },
  { id: "cursor", label: "Cursor" },
  { id: "v0", label: "v0" },
  { id: "lovable", label: "Lovable" },
  { id: "bolt", label: "Bolt" },
  { id: "replit", label: "Replit" },
  { id: "remaxx", label: "REMAXX editor" },
  { id: "hand-coded", label: "Hand-coded" },
  { id: "other", label: "Other" },
] as const;

export const CATEGORIES = [
  { id: "landing-page", label: "Landing page" },
  { id: "website", label: "Website" },
  { id: "portfolio", label: "Portfolio" },
  { id: "web-app", label: "Web app" },
  { id: "tool", label: "Tool" },
  { id: "dashboard", label: "Dashboard" },
  { id: "game", label: "Game" },
  { id: "store", label: "Store" },
  { id: "ui-kit", label: "UI kit" },
  { id: "component", label: "Component" },
] as const;

export const STYLES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "minimal", label: "Minimal" },
  { id: "glassy", label: "Glassy" },
  { id: "brutalist", label: "Brutalist" },
  { id: "playful", label: "Playful" },
  { id: "pastel", label: "Pastel" },
  { id: "retro", label: "Retro" },
  { id: "neon", label: "Neon" },
  { id: "editorial", label: "Editorial" },
  { id: "corporate", label: "Corporate" },
  { id: "organic", label: "Organic" },
  { id: "bold", label: "Bold" },
  { id: "elegant", label: "Elegant" },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export type StyleId = (typeof STYLES)[number]["id"];

export const isToolId = (v: string): v is ToolId => TOOLS.some((t) => t.id === v);
export const isCategoryId = (v: string): v is CategoryId => CATEGORIES.some((c) => c.id === v);
export const isStyleId = (v: string): v is StyleId => STYLES.some((s) => s.id === v);

export const labelFor = (list: readonly { id: string; label: string }[], id: string): string =>
  list.find((x) => x.id === id)?.label ?? id;
