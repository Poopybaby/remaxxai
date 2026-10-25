/**
 * The REMAXX crew: default profile pictures. Every new account gets one at random and can switch
 * to another or upload their own. Images live in public/avatars/ (512×512 WebP).
 * Keep in sync with the list in db/migrations/0007_avatars.sql (a test checks).
 */
export const DEFAULT_AVATARS = [
  {
    id: "sprinkles",
    name: "Sprinkles",
    tagline: "A confetti-spotted monkey who remixes everything twice.",
    url: "/avatars/sprinkles.webp",
  },
  {
    id: "patch",
    name: "Patch",
    tagline: "A bear stitched together from other bears' best parts. Very on brand.",
    url: "/avatars/patch.webp",
  },
  {
    id: "plume",
    name: "Plume",
    tagline: "An owl with an eye for detail. Spots the one pixel that's off.",
    url: "/avatars/plume.webp",
  },
  {
    id: "snooze",
    name: "Snooze",
    tagline: "A sloth who lets the AI do the heavy lifting.",
    url: "/avatars/snooze.webp",
  },
] as const;

export type DefaultAvatarId = (typeof DEFAULT_AVATARS)[number]["id"];

export function defaultAvatar(id: string) {
  return DEFAULT_AVATARS.find((a) => a.id === id) ?? null;
}

/** A random default avatar URL for a new account. */
export function randomDefaultAvatarUrl(random: () => number = Math.random): string {
  const i = Math.min(DEFAULT_AVATARS.length - 1, Math.floor(random() * DEFAULT_AVATARS.length));
  return DEFAULT_AVATARS[i]!.url;
}

/** Profile picture URLs the database accepts (see the check constraint in 0007_avatars.sql). */
export const AVATAR_URL_PATTERN =
  /^(https:\/\/.+|\/avatars\/[a-z]+\.webp|\/media\/[a-f0-9]{64}\.(png|jpg|webp|gif))$/;
