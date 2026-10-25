/**
 * Profile business logic. Takes a `Db` so it runs against Postgres in production and PGlite in tests.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AVATAR_URL_PATTERN, randomDefaultAvatarUrl } from "@/config/avatars";
import { LEGAL_VERSIONS } from "@/config/legal";
import { HANDLE_ERROR_MESSAGES, validateHandle } from "@/lib/auth/handles";
import { canEditProfile, type Viewer } from "@/lib/auth/permissions";
import { legalAcceptances, profiles, type Profile } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";

export type FieldErrors = Partial<Record<string, string>>;
export type Result<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

const displayName = z
  .string()
  .trim()
  .min(1, "Add a display name.")
  .max(50, "Display names can be at most 50 characters.");

const websiteUrl = z
  .string()
  .trim()
  .max(200, "That link is too long.")
  .transform((v) => (v === "" ? null : v))
  .pipe(
    z.url({ protocol: /^https?$/, message: "Use a full link starting with https://" }).nullable(),
  );

const createInput = z.object({
  handle: z.string(),
  displayName,
  ageConfirmed: z.literal(true, { message: `You need to confirm you're 18 or older.` }),
  termsAccepted: z.literal(true, {
    message: "You need to accept the Terms and Acceptable Use Policy.",
  }),
  /** A built-in avatar, an uploaded one, or an https URL. Omitted: one of the crew at random. */
  avatarUrl: z.string().regex(AVATAR_URL_PATTERN).nullable().optional(),
});

export type CreateProfileInput = z.input<typeof createInput>;

/** Creates the profile for a newly signed-up user and records their legal acceptances. */
export async function createProfile(
  db: Db,
  userId: string,
  input: CreateProfileInput,
): Promise<Result<Profile>> {
  const parsed = createInput.safeParse(input);
  const errors: FieldErrors = parsed.success ? {} : flattenErrors(parsed.error);
  const handle = validateHandle(input.handle);
  if (!handle.ok) errors.handle = HANDLE_ERROR_MESSAGES[handle.error];
  if (!parsed.success || !handle.ok) return { ok: false, errors };

  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId));
  if (existing.length > 0) return { ok: false, errors: { form: "Your profile already exists." } };

  if (!(await isHandleAvailable(db, handle.handle))) {
    return { ok: false, errors: { handle: "That handle is taken. Try another one." } };
  }

  const now = new Date();
  try {
    const profile = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(profiles)
        .values({
          id: userId,
          handle: handle.handle,
          displayName: parsed.data.displayName,
          avatarUrl: parsed.data.avatarUrl ?? randomDefaultAvatarUrl(),
          ageConfirmedAt: now,
        })
        .returning();
      await tx.insert(legalAcceptances).values([
        { userId, document: "terms", version: LEGAL_VERSIONS.terms, acceptedAt: now },
        {
          userId,
          document: "acceptable_use",
          version: LEGAL_VERSIONS.acceptableUse,
          acceptedAt: now,
        },
      ]);
      if (!row) throw new Error("Profile insert returned no row");
      return row;
    });
    return { ok: true, value: profile };
  } catch (err) {
    // Two people racing for the same handle: the unique constraint decides.
    if (isUniqueViolation(err)) {
      return { ok: false, errors: { handle: "That handle is taken. Try another one." } };
    }
    throw err;
  }
}

const updateInput = z.object({
  displayName,
  bio: z.string().trim().max(280, "Bios can be at most 280 characters."),
  websiteUrl,
});

export type UpdateProfileInput = z.input<typeof updateInput>;

/**
 * Updates the editable fields of a profile. Role, handle and age confirmation are never
 * editable here, whatever the input contains.
 */
export async function updateProfile(
  db: Db,
  viewer: Viewer,
  profileId: string,
  input: UpdateProfileInput,
): Promise<Result<Profile>> {
  if (!canEditProfile(viewer, profileId)) {
    return { ok: false, errors: { form: "You can only edit your own profile." } };
  }
  const parsed = updateInput.safeParse(input);
  if (!parsed.success) return { ok: false, errors: flattenErrors(parsed.error) };

  const [row] = await db
    .update(profiles)
    .set({
      displayName: parsed.data.displayName,
      bio: parsed.data.bio,
      websiteUrl: parsed.data.websiteUrl,
    })
    .where(eq(profiles.id, profileId))
    .returning();
  if (!row) return { ok: false, errors: { form: "That profile doesn't exist." } };
  return { ok: true, value: row };
}

export async function isHandleAvailable(db: Db, handle: string): Promise<boolean> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.handle, handle));
  return rows.length === 0;
}

export async function getProfileById(db: Db, id: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, id));
  return row ?? null;
}

export async function getProfileByHandle(db: Db, handle: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.handle, handle.toLowerCase()));
  return row ?? null;
}

function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export function isUniqueViolation(err: unknown): boolean {
  // Postgres SQLSTATE 23505. Drizzle wraps driver errors, so check the cause chain too.
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && "code" in current && current.code === "23505") return true;
    current = typeof current === "object" && "cause" in current ? current.cause : undefined;
  }
  return false;
}
