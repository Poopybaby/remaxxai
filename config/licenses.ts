/**
 * License catalog and remix rules. Decided Oct 21, 2026 (PLAN.md, Q3):
 * - Uploads may use MIT, Apache-2.0, CC BY 4.0, CC BY-SA 4.0, CC0, or REMAXX Personal Use.
 * - No "No-Derivatives" licenses: remixing is the point of the platform.
 * - A remix's license must be compatible with EVERY ancestor:
 *     CC0 → anything; MIT / Apache / CC BY → anything (attribution is kept by the credit chain);
 *     CC BY-SA → stays CC BY-SA; Personal Use → stays Personal Use.
 * Changing these rules is a legal decision. Tests in tests/unit/licensing.test.ts pin them.
 */

export const LICENSE_IDS = [
  "mit",
  "apache-2.0",
  "cc-by-4.0",
  "cc-by-sa-4.0",
  "cc0-1.0",
  "remaxx-personal",
] as const;
export type LicenseId = (typeof LICENSE_IDS)[number];

export type License = {
  id: LicenseId;
  name: string;
  shortName: string;
  spdxId: string | null;
  url: string;
  summary: string;
  commercialUse: boolean;
  attributionRequired: boolean;
  shareAlike: boolean;
  /** Licenses a direct remix of this work may be published under. */
  remixAs: readonly LicenseId[];
};

const ALL: readonly LicenseId[] = LICENSE_IDS;

export const LICENSES: Record<LicenseId, License> = {
  mit: {
    id: "mit",
    name: "MIT License",
    shortName: "MIT",
    spdxId: "MIT",
    url: "https://opensource.org/license/mit",
    summary: "Anyone can use, change and sell it, as long as the copyright notice stays.",
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    remixAs: ALL,
  },
  "apache-2.0": {
    id: "apache-2.0",
    name: "Apache License 2.0",
    shortName: "Apache 2.0",
    spdxId: "Apache-2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
    summary: "Like MIT, plus an explicit patent grant. Changes must be noted.",
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    remixAs: ALL,
  },
  "cc-by-4.0": {
    id: "cc-by-4.0",
    name: "Creative Commons Attribution 4.0",
    shortName: "CC BY",
    spdxId: "CC-BY-4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
    summary: "Anyone can use and change it, including commercially, with credit.",
    commercialUse: true,
    attributionRequired: true,
    shareAlike: false,
    remixAs: ALL,
  },
  "cc-by-sa-4.0": {
    id: "cc-by-sa-4.0",
    name: "Creative Commons Attribution-ShareAlike 4.0",
    shortName: "CC BY-SA",
    spdxId: "CC-BY-SA-4.0",
    url: "https://creativecommons.org/licenses/by-sa/4.0/",
    summary: "Anyone can use and change it with credit; remixes must use the same license.",
    commercialUse: true,
    attributionRequired: true,
    shareAlike: true,
    remixAs: ["cc-by-sa-4.0"],
  },
  "cc0-1.0": {
    id: "cc0-1.0",
    name: "CC0 1.0 (Public Domain Dedication)",
    shortName: "CC0",
    spdxId: "CC0-1.0",
    url: "https://creativecommons.org/publicdomain/zero/1.0/",
    summary: "No rights reserved. Anyone can do anything with it, no credit required.",
    commercialUse: true,
    attributionRequired: false,
    shareAlike: false,
    remixAs: ALL,
  },
  "remaxx-personal": {
    id: "remaxx-personal",
    name: "REMAXX Personal Use",
    shortName: "Personal use",
    spdxId: null,
    url: "/legal/terms#personal-use-license",
    summary:
      "Remix it on REMAXX and use it personally. No commercial use; remixes stay Personal Use.",
    commercialUse: false,
    attributionRequired: true,
    shareAlike: true,
    remixAs: ["remaxx-personal"],
  },
};

export function isLicenseId(value: string): value is LicenseId {
  return (LICENSE_IDS as readonly string[]).includes(value);
}

export const DEFAULT_LICENSE: LicenseId = "mit";
