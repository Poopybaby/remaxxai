import { LICENSE_IDS, LICENSES, type LicenseId } from "@/config/licenses";

/**
 * Licenses a remix may be published under, given the licenses of every ancestor in its chain
 * (direct parent, grandparent, ...). It's the intersection of what each ancestor allows, so a
 * share-alike license anywhere upstream binds every remix below it.
 */
export function allowedRemixLicenses(ancestorLicenses: readonly LicenseId[]): LicenseId[] {
  return LICENSE_IDS.filter((candidate) =>
    ancestorLicenses.every((ancestor) => LICENSES[ancestor].remixAs.includes(candidate)),
  );
}

export function canPublishRemixAs(
  ancestorLicenses: readonly LicenseId[],
  chosen: LicenseId,
): boolean {
  return allowedRemixLicenses(ancestorLicenses).includes(chosen);
}

/** The license a remix starts with: its direct parent's, which is always allowed. */
export function defaultRemixLicense(ancestorLicenses: readonly LicenseId[]): LicenseId {
  const allowed = allowedRemixLicenses(ancestorLicenses);
  const parent = ancestorLicenses[0];
  if (parent && allowed.includes(parent)) return parent;
  const first = allowed[0];
  if (!first) throw new Error("No license is compatible with this remix chain");
  return first;
}

/** Plain-English note shown next to the license picker on a remix. */
export function remixLicenseNote(ancestorLicenses: readonly LicenseId[]): string | null {
  const allowed = allowedRemixLicenses(ancestorLicenses);
  if (allowed.length === LICENSE_IDS.length) return null;
  if (allowed.length === 1) {
    const only = LICENSES[allowed[0]!];
    return `This remix must stay ${only.shortName} because something it's built on uses that license.`;
  }
  return `Some licenses aren't available because of the licenses upstream of this remix.`;
}
