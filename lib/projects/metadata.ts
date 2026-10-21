import { z } from "zod";
import { LICENSE_IDS } from "@/config/licenses";
import { PROJECT_TEXT_LIMITS as L } from "@/config/limits";
import { CATEGORIES, STYLES, TOOLS } from "@/config/taxonomy";

/** Version of the rights statement people confirm on upload. Bump when its wording changes. */
export const RIGHTS_STATEMENT_VERSION = "2026-10-21";
export const RIGHTS_STATEMENT =
  "I made this or have permission to share it, it contains no proprietary or leaked code, and I'm sharing it under the license I picked.";

const ids = <T extends readonly { id: string }[]>(list: T) =>
  list.map((x) => x.id) as [string, ...string[]];

export function normalizeTag(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, L.tagMaxLength)
    .replace(/-+$/g, "");
}

export const projectMetadataSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(L.titleMin, `Titles need at least ${L.titleMin} characters.`)
      .max(L.titleMax, `Titles can be at most ${L.titleMax} characters.`),
    description: z
      .string()
      .trim()
      .max(L.descriptionMax, `Descriptions can be at most ${L.descriptionMax} characters.`),
    category: z.enum(ids(CATEGORIES), { message: "Pick a category." }),
    toolUsed: z.enum(ids(TOOLS), { message: "Pick the tool you used." }),
    licenseId: z.enum(LICENSE_IDS, { message: "Pick a license." }),
    styles: z.array(z.enum(ids(STYLES))).max(4, "Pick up to 4 styles."),
    tags: z
      .array(z.string())
      .transform((tags) => [...new Set(tags.map(normalizeTag).filter((t) => t.length >= 2))])
      .pipe(z.array(z.string()).max(L.maxTags, `Add up to ${L.maxTags} tags.`)),
    rightsConfirmed: z.literal(true, {
      message: "Confirm that you have the rights to share this.",
    }),
  })
  .refine((m) => m.styles.length + m.tags.length <= L.maxTags + 4, { message: "Too many tags." });

export type ProjectMetadata = z.output<typeof projectMetadataSchema>;
export type ProjectMetadataInput = z.input<typeof projectMetadataSchema>;

export function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return base || "project";
}

/** Slug plus a short random suffix so titles never collide. */
export function uniqueSlug(title: string, random: () => string = randomSuffix): string {
  return `${slugify(title)}-${random()}`;
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
