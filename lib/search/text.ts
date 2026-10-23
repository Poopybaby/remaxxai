/**
 * Search vocabulary: turning a vibe query into terms, mapping everyday words onto REMAXX's style,
 * category and tool filters, and building the text a project is indexed and matched by.
 * Pure functions only, so ranking stays testable.
 */
import {
  CATEGORIES,
  STYLES,
  TOOLS,
  labelFor,
  type CategoryId,
  type StyleId,
  type ToolId,
} from "@/config/taxonomy";

const STOPWORDS = new Set(
  "a an and any app are as at be but by can do for from get give i in into is it its just like looking make me my need of on or please show site so some something that the this to template templates thing want website with".split(
    " ",
  ),
);

/** Everyday words people type, mapped to the style chips. */
const STYLE_WORDS: Record<string, StyleId> = {
  dark: "dark",
  night: "dark",
  moody: "dark",
  darkmode: "dark",
  black: "dark",
  light: "light",
  bright: "light",
  white: "light",
  airy: "light",
  minimal: "minimal",
  minimalist: "minimal",
  clean: "minimal",
  simple: "minimal",
  calm: "minimal",
  glassy: "glassy",
  glass: "glassy",
  glassmorphism: "glassy",
  frosted: "glassy",
  translucent: "glassy",
  brutalist: "brutalist",
  brutal: "brutalist",
  brutalism: "brutalist",
  neubrutalist: "brutalist",
  neubrutalism: "brutalist",
  raw: "brutalist",
  playful: "playful",
  fun: "playful",
  cute: "playful",
  whimsical: "playful",
  friendly: "playful",
  cheerful: "playful",
  pastel: "pastel",
  soft: "pastel",
  retro: "retro",
  vintage: "retro",
  pixel: "retro",
  "8bit": "retro",
  eighties: "retro",
  synthwave: "retro",
  neon: "neon",
  glow: "neon",
  glowing: "neon",
  cyber: "neon",
  cyberpunk: "neon",
  editorial: "editorial",
  magazine: "editorial",
  serif: "editorial",
  corporate: "corporate",
  business: "corporate",
  enterprise: "corporate",
  professional: "corporate",
  organic: "organic",
  earthy: "organic",
  natural: "organic",
  nature: "organic",
  bold: "bold",
  loud: "bold",
  vibrant: "bold",
  punchy: "bold",
  elegant: "elegant",
  luxury: "elegant",
  luxurious: "elegant",
  classy: "elegant",
  premium: "elegant",
  fancy: "elegant",
};

const CATEGORY_WORDS: Record<string, CategoryId> = {
  landing: "landing-page",
  homepage: "landing-page",
  portfolio: "portfolio",
  resume: "portfolio",
  dashboard: "dashboard",
  admin: "dashboard",
  analytics: "dashboard",
  game: "game",
  arcade: "game",
  store: "store",
  shop: "store",
  ecommerce: "store",
  storefront: "store",
  kit: "ui-kit",
  components: "ui-kit",
  component: "component",
  tool: "tool",
  calculator: "tool",
  generator: "tool",
  converter: "tool",
  timer: "tool",
};

const TOOL_WORDS: Record<string, ToolId> = {
  claude: "claude",
  chatgpt: "chatgpt",
  gpt: "chatgpt",
  openai: "chatgpt",
  gemini: "gemini",
  deepseek: "deepseek",
  cursor: "cursor",
  v0: "v0",
  lovable: "lovable",
  bolt: "bolt",
  replit: "replit",
};

/** Lowercases, splits and lightly stems ("dashboards" → "dashboard"). */
export function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  return word;
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/8-bit/g, "8bit")
    .replace(/dark[\s-]mode/g, "darkmode")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export type TermMeaning = { style?: StyleId; category?: CategoryId; tool?: ToolId };

export type ParsedQuery = {
  /** Meaningful words, stemmed, stopwords removed, de-duplicated. */
  terms: string[];
  /** What each term means in REMAXX's filters, when it means anything. */
  meanings: Record<string, TermMeaning>;
  styles: StyleId[];
  categories: CategoryId[];
  tools: ToolId[];
};

export function parseQuery(q: string): ParsedQuery {
  const terms: string[] = [];
  const meanings: Record<string, TermMeaning> = {};
  const styles = new Set<StyleId>();
  const categories = new Set<CategoryId>();
  const tools = new Set<ToolId>();
  for (const raw of words(q).slice(0, 24)) {
    if (STOPWORDS.has(raw) || raw.length < 2) continue;
    const t = stem(raw);
    if (terms.includes(t)) continue;
    terms.push(t);
    const meaning: TermMeaning = {};
    const style = STYLE_WORDS[raw] ?? STYLE_WORDS[t];
    if (style) styles.add((meaning.style = style));
    const category = CATEGORY_WORDS[raw] ?? CATEGORY_WORDS[t];
    if (category) categories.add((meaning.category = category));
    const tool = TOOL_WORDS[raw];
    if (tool) tools.add((meaning.tool = tool));
    meanings[t] = meaning;
  }
  return { terms, meanings, styles: [...styles], categories: [...categories], tools: [...tools] };
}

export type IndexableProject = {
  title: string;
  description: string;
  category: string;
  toolUsed: string;
  /** Style tag ids (dark, glassy...). */
  styles: string[];
  /** Free-form topic tags. */
  tags: string[];
  styleDescription: string;
};

/**
 * The text a project is matched and embedded by. Labels are spelled out ("Style: Dark, Glassy")
 * so both keyword search and the embedding model see them as words.
 */
export function buildSearchText(p: IndexableProject): string {
  const styleLabels = p.styles.map((s) => labelFor(STYLES, s));
  const parts = [
    `${p.title}.`,
    p.description,
    `Category: ${labelFor(CATEGORIES, p.category)}.`,
    `Made with ${labelFor(TOOLS, p.toolUsed)}.`,
    styleLabels.length ? `Style: ${styleLabels.join(", ")}.` : "",
    p.tags.length ? `Tags: ${p.tags.map((t) => t.replace(/-/g, " ")).join(", ")}.` : "",
    p.styleDescription ? `Look and feel: ${p.styleDescription}` : "",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 4000);
}

/** Terms per field, used to explain matches and to score keyword overlap. */
export type ProjectTerms = {
  title: Set<string>;
  tags: Set<string>;
  styles: Set<string>;
  category: string;
  tool: string;
  body: Set<string>;
};

export function projectTerms(p: IndexableProject): ProjectTerms {
  const set = (text: string) => new Set(words(text).map(stem));
  return {
    title: set(p.title),
    tags: new Set(p.tags.flatMap((t) => words(t).map(stem))),
    styles: new Set(p.styles),
    category: p.category,
    tool: p.toolUsed,
    body: set(`${p.description} ${p.styleDescription}`),
  };
}
