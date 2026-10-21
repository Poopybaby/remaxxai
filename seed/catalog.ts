/**
 * Starter templates for the gallery. All are original work made for REMAXX and published by the
 * official REMAXX Studio account under the license listed. Brands, people and places in them are
 * fictional. Files live in seed/templates/<slug>/; covers in public/seed/covers/<slug>.jpg.
 */
import type { LicenseId } from "@/config/licenses";
import type { CategoryId, StyleId, ToolId } from "@/config/taxonomy";

export type SeedTemplate = {
  slug: string;
  title: string;
  description: string;
  category: CategoryId;
  tool: ToolId;
  license: LicenseId;
  styles: StyleId[];
  tags: string[];
  /** Slug of the template this one remixes. */
  parent?: string;
};

export const STUDIO = {
  id: "5e3d0000-0000-4000-8000-00000000c0de",
  email: "studio@remaxx.ai",
  handle: "remaxx_studio",
  displayName: "REMAXX Studio",
  bio: "Starter templates made by the REMAXX team. Every one is free to remix.",
} as const;

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    slug: "moonbrew",
    title: "Moonbrew coffee pop-up",
    description:
      "A soft pastel landing page for a late-night coffee van, with a menu and a 'text me when you park' button. A friendly first remix: swap the menu and colors for any small food business.",
    category: "landing-page",
    tool: "claude",
    license: "mit",
    styles: ["pastel", "playful"],
    tags: ["coffee", "food", "small-business"],
  },
  {
    slug: "moonbrew-night",
    title: "Moonbrew Night",
    description:
      "Moonbrew remixed with the prompt 'make it dark and glassy': frosted panels, glowing orbs, thin type.",
    category: "landing-page",
    tool: "claude",
    license: "mit",
    styles: ["dark", "glassy"],
    tags: ["coffee", "food"],
    parent: "moonbrew",
  },
  {
    slug: "moonbrew-live",
    title: "Moonbrew Live",
    description:
      "Moonbrew Night remixed again with 'turn it into a loud gig poster': yellow, red stripe, giant type and a scrolling ticker.",
    category: "landing-page",
    tool: "gemini",
    license: "mit",
    styles: ["brutalist", "bold"],
    tags: ["event", "poster", "coffee"],
    parent: "moonbrew-night",
  },
  {
    slug: "ledgerline",
    title: "Ledgerline finance dashboard",
    description:
      "A dark personal-finance dashboard with KPI cards, an SVG balance chart with a 7/30/90-day switch, budgets and recent transactions. No chart library.",
    category: "dashboard",
    tool: "claude",
    license: "mit",
    styles: ["dark", "glassy"],
    tags: ["fintech", "finance", "charts"],
  },
  {
    slug: "petal-and-pine",
    title: "Petal & Pine flower studio",
    description:
      "A playful pastel site for a florist with blob shapes, bouquet cards and a pick-your-Friday booking widget.",
    category: "website",
    tool: "chatgpt",
    license: "cc-by-4.0",
    styles: ["pastel", "playful"],
    tags: ["booking", "florist", "small-business"],
  },
  {
    slug: "orbit-portfolio",
    title: "Quiet designer portfolio",
    description:
      "A calm, editorial one-page portfolio: a big serif intro, three case studies and a contact line. Built to be personalized in five minutes.",
    category: "portfolio",
    tool: "hand-coded",
    license: "cc0-1.0",
    styles: ["minimal", "editorial", "light"],
    tags: ["portfolio", "designer", "resume"],
  },
  {
    slug: "pixel-pantry",
    title: "Pixel Pantry recipe scaler",
    description: "A retro 8-bit recipe card that scales ingredient amounts as you change servings.",
    category: "tool",
    tool: "deepseek",
    license: "mit",
    styles: ["retro", "playful"],
    tags: ["recipe", "cooking", "pixel-art"],
  },
  {
    slug: "tidepool-habits",
    title: "Tidepool habit tracker",
    description:
      "A gentle habit tracker with weekly dots and soft sea-glass colors. Saves to the browser when it can.",
    category: "web-app",
    tool: "claude",
    license: "mit",
    styles: ["organic", "minimal", "light"],
    tags: ["habits", "productivity", "wellness"],
  },
  {
    slug: "synthwave-countdown",
    title: "Nightdrive event countdown",
    description:
      "A synthwave launch countdown with a striped sun, a moving neon grid and an RSVP button.",
    category: "landing-page",
    tool: "gemini",
    license: "cc0-1.0",
    styles: ["neon", "retro", "dark"],
    tags: ["event", "countdown", "music"],
  },
  {
    slug: "paper-trail-blog",
    title: "The Paper Trail magazine",
    description:
      "A small-magazine front page with a masthead, drop cap and section filters. Shared under CC BY-SA, so remixes stay CC BY-SA.",
    category: "website",
    tool: "hand-coded",
    license: "cc-by-sa-4.0",
    styles: ["editorial", "light", "elegant"],
    tags: ["blog", "magazine", "writing"],
  },
  {
    slug: "bento-saas",
    title: "Relay SaaS landing (bento)",
    description:
      "A clean SaaS landing page with a bento feature grid, a live auto-assign demo and an email signup. Split into HTML, CSS and JS files.",
    category: "landing-page",
    tool: "v0",
    license: "apache-2.0",
    styles: ["light", "corporate", "minimal"],
    tags: ["saas", "startup", "bento"],
  },
  {
    slug: "brutal-notes",
    title: "NOTES. brutalist notes app",
    description:
      "A loud brutalist notes app: thick borders, hard shadows, neon cards. Cmd+Enter to save.",
    category: "web-app",
    tool: "cursor",
    license: "cc0-1.0",
    styles: ["brutalist", "bold"],
    tags: ["notes", "productivity"],
  },
  {
    slug: "lumen-pricing",
    title: "Lumen pricing table",
    description:
      "An elegant dark-and-gold pricing table with a monthly/yearly toggle and a featured plan.",
    category: "component",
    tool: "claude",
    license: "mit",
    styles: ["elegant", "dark"],
    tags: ["pricing", "saas"],
  },
  {
    slug: "forest-trail-guide",
    title: "Hollow Creek trail guide",
    description: "An earthy trail guide with layered SVG hills and difficulty filters.",
    category: "website",
    tool: "chatgpt",
    license: "cc-by-4.0",
    styles: ["organic"],
    tags: ["outdoors", "travel", "hiking"],
  },
  {
    slug: "arcade-snake",
    title: "Neon Snake",
    description:
      "Classic snake on a canvas with neon glow, keyboard and touch controls, and a best score.",
    category: "game",
    tool: "claude",
    license: "mit",
    styles: ["neon", "retro", "dark"],
    tags: ["arcade", "canvas", "game"],
  },
  {
    slug: "memory-match",
    title: "Snack Match memory game",
    description:
      "A cheerful card-matching game with move counting. A good first remix: swap the snacks for your own theme.",
    category: "game",
    tool: "chatgpt",
    license: "cc0-1.0",
    styles: ["playful"],
    tags: ["kids", "game", "cards"],
  },
  {
    slug: "color-lab",
    title: "Color Lab palette generator",
    description:
      "Generate five-color palettes from a harmony rule, lock the ones you like, press space for more.",
    category: "tool",
    tool: "claude",
    license: "mit",
    styles: ["minimal", "light"],
    tags: ["color", "design-tools"],
  },
  {
    slug: "tip-split",
    title: "Split It tip calculator",
    description: "A bold bill-splitting calculator with tip presets and a people counter.",
    category: "tool",
    tool: "gemini",
    license: "mit",
    styles: ["bold", "dark"],
    tags: ["calculator", "money"],
  },
  {
    slug: "studio-ceramics-shop",
    title: "Kiln & Clay ceramics shop",
    description:
      "A warm, minimal storefront with a product grid and slide-in cart. Bring your own checkout.",
    category: "store",
    tool: "lovable",
    license: "mit",
    styles: ["elegant", "minimal", "light"],
    tags: ["shop", "ecommerce", "ceramics"],
  },
  {
    slug: "sneaker-drop",
    title: "Volt Runner sneaker drop",
    description:
      "A streetwear drop page with a countdown, size picker and ticker. Shared for personal use only: remix it, but not for commercial use.",
    category: "store",
    tool: "claude",
    license: "remaxx-personal",
    styles: ["bold", "brutalist"],
    tags: ["streetwear", "drop", "countdown"],
  },
  {
    slug: "ui-kit-glass",
    title: "Frost UI glass kit",
    description:
      "A tiny glassmorphism component kit: buttons, inputs, toggles, profile, progress and toast.",
    category: "ui-kit",
    tool: "claude",
    license: "mit",
    styles: ["glassy", "pastel"],
    tags: ["components", "glassmorphism"],
  },
  {
    slug: "ui-kit-neubrutal",
    title: "CHUNK neubrutalist UI kit",
    description: "Loud, friendly neubrutalist components with thick borders and hard shadows.",
    category: "ui-kit",
    tool: "bolt",
    license: "cc0-1.0",
    styles: ["brutalist", "playful", "bold"],
    tags: ["components", "neubrutalism"],
  },
  {
    slug: "kanban-lite",
    title: "Lanes kanban board",
    description:
      "A three-lane kanban board with drag and drop, arrow buttons and tags. Plain JS split across three files.",
    category: "web-app",
    tool: "cursor",
    license: "mit",
    styles: ["minimal", "light"],
    tags: ["kanban", "productivity", "drag-and-drop"],
  },
  {
    slug: "weather-mood",
    title: "Weather mood card",
    description:
      "A glassy weather card whose background shifts with the conditions. Swap in a real weather API to make it live.",
    category: "component",
    tool: "gemini",
    license: "mit",
    styles: ["glassy"],
    tags: ["weather", "card"],
  },
  {
    slug: "podcast-landing",
    title: "Low Signal podcast page",
    description:
      "A dark podcast landing page with a gradient cover, waveform player and episode list.",
    category: "landing-page",
    tool: "chatgpt",
    license: "cc-by-4.0",
    styles: ["dark", "bold"],
    tags: ["podcast", "audio", "music"],
  },
  {
    slug: "dev-docs",
    title: "Quill docs site",
    description:
      "A clean documentation layout with sidebar search, install tabs, copy buttons and callouts.",
    category: "website",
    tool: "v0",
    license: "apache-2.0",
    styles: ["minimal", "light"],
    tags: ["docs", "developer"],
  },
  {
    slug: "wedding-rsvp",
    title: "Maya & Theo wedding invite",
    description: "An elegant one-page wedding invitation with an RSVP card. Personal use only.",
    category: "website",
    tool: "claude",
    license: "remaxx-personal",
    styles: ["elegant", "light"],
    tags: ["wedding", "invitation", "rsvp"],
  },
  {
    slug: "markdown-previewer",
    title: "Marked Up markdown previewer",
    description:
      "Type markdown on the left, see it rendered on the right. A tiny, safe renderer in about 40 lines.",
    category: "tool",
    tool: "deepseek",
    license: "mit",
    styles: ["minimal", "editorial"],
    tags: ["markdown", "writing", "developer"],
  },
  {
    slug: "fitness-timer",
    title: "Interval workout timer",
    description:
      "A bold interval timer with a progress ring, work/rest colors and adjustable rounds.",
    category: "tool",
    tool: "chatgpt",
    license: "cc0-1.0",
    styles: ["bold"],
    tags: ["fitness", "timer", "workout"],
  },
];
