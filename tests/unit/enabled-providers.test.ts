import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {} }));
const { reconcileProviders } = await import("@/lib/supabase/enabled-providers");

describe("reconcileProviders", () => {
  it("only shows providers Supabase has switched on, using Supabase's names", () => {
    expect(
      reconcileProviders(["google", "microsoft", "apple"], {
        google: true,
        azure: false,
        apple: true,
        email: true,
      }),
    ).toEqual({ shown: ["google", "apple"], notEnabled: ["microsoft"], checked: true });
    expect(reconcileProviders(["microsoft"], { azure: true })).toMatchObject({
      shown: ["microsoft"],
    });
  });

  it("hides a provider that's listed in Vercel but still off in Supabase (the 400 error case)", () => {
    expect(reconcileProviders(["google"], { google: false })).toEqual({
      shown: [],
      notEnabled: ["google"],
      checked: true,
    });
  });

  it("shows everything listed when Supabase didn't answer, rather than hiding working buttons", () => {
    expect(reconcileProviders(["google"], undefined)).toEqual({
      shown: ["google"],
      notEnabled: [],
      checked: false,
    });
  });
});
