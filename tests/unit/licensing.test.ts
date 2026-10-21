import { describe, expect, it } from "vitest";
import { LICENSE_IDS, LICENSES, type LicenseId } from "@/config/licenses";
import {
  allowedRemixLicenses,
  canPublishRemixAs,
  defaultRemixLicense,
  remixLicenseNote,
} from "@/lib/licensing/compat";

const permissive: LicenseId[] = ["mit", "apache-2.0", "cc-by-4.0", "cc0-1.0"];

describe("license catalog (decided Oct 21, 2026)", () => {
  it("offers exactly the six agreed licenses, and no no-derivatives license", () => {
    expect([...LICENSE_IDS].sort()).toEqual(
      ["apache-2.0", "cc-by-4.0", "cc-by-sa-4.0", "cc0-1.0", "mit", "remaxx-personal"].sort(),
    );
    for (const id of LICENSE_IDS) expect(id).not.toMatch(/nd/);
  });

  it("Personal Use is the only non-commercial license", () => {
    expect(LICENSE_IDS.filter((id) => !LICENSES[id].commercialUse)).toEqual(["remaxx-personal"]);
  });

  it("CC0 is the only license without attribution", () => {
    expect(LICENSE_IDS.filter((id) => !LICENSES[id].attributionRequired)).toEqual(["cc0-1.0"]);
  });
});

describe("allowedRemixLicenses", () => {
  it("an original (no ancestors) can use any license", () => {
    expect(allowedRemixLicenses([])).toEqual([...LICENSE_IDS]);
  });

  it.each(permissive)("a remix of %s can use any license", (parent) => {
    expect(allowedRemixLicenses([parent])).toEqual([...LICENSE_IDS]);
  });

  it("a remix of CC BY-SA must stay CC BY-SA", () => {
    expect(allowedRemixLicenses(["cc-by-sa-4.0"])).toEqual(["cc-by-sa-4.0"]);
  });

  it("a remix of Personal Use must stay Personal Use", () => {
    expect(allowedRemixLicenses(["remaxx-personal"])).toEqual(["remaxx-personal"]);
  });

  it("share-alike anywhere upstream binds every remix below it", () => {
    // MIT parent, but the grandparent was CC BY-SA.
    expect(allowedRemixLicenses(["mit", "cc-by-sa-4.0"])).toEqual(["cc-by-sa-4.0"]);
    expect(allowedRemixLicenses(["cc0-1.0", "mit", "remaxx-personal"])).toEqual([
      "remaxx-personal",
    ]);
  });

  it("conflicting share-alike licenses upstream leave no valid license", () => {
    expect(allowedRemixLicenses(["cc-by-sa-4.0", "remaxx-personal"])).toEqual([]);
  });

  it("every license allows remixing under itself (so a chain is never stuck by its own parent)", () => {
    for (const id of LICENSE_IDS) expect(allowedRemixLicenses([id])).toContain(id);
  });
});

describe("canPublishRemixAs / defaultRemixLicense / remixLicenseNote", () => {
  it("rejects relicensing a share-alike chain", () => {
    expect(canPublishRemixAs(["cc-by-sa-4.0"], "mit")).toBe(false);
    expect(canPublishRemixAs(["remaxx-personal"], "cc0-1.0")).toBe(false);
    expect(canPublishRemixAs(["mit"], "remaxx-personal")).toBe(true);
  });

  it("defaults to the parent's license", () => {
    expect(defaultRemixLicense(["apache-2.0"])).toBe("apache-2.0");
    expect(defaultRemixLicense(["mit", "cc-by-sa-4.0"])).toBe("cc-by-sa-4.0");
    expect(defaultRemixLicense([])).toBe("mit");
  });

  it("throws when nothing is compatible", () => {
    expect(() => defaultRemixLicense(["cc-by-sa-4.0", "remaxx-personal"])).toThrow();
  });

  it("explains restrictions in plain English", () => {
    expect(remixLicenseNote(["mit"])).toBeNull();
    expect(remixLicenseNote(["cc-by-sa-4.0"])).toMatch(/must stay CC BY-SA/);
  });
});
