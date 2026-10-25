import { describe, expect, it } from "vitest";
import { AUTH_PROVIDERS, enabledAuthProviders } from "@/config/auth";

describe("enabledAuthProviders", () => {
  it("shows only listed providers, most-used first, whatever order they're listed in", () => {
    expect(enabledAuthProviders("apple, GOOGLE ,microsoft")).toEqual([
      "google",
      "microsoft",
      "apple",
    ]);
    expect(enabledAuthProviders("")).toEqual([]);
    expect(enabledAuthProviders(undefined)).toEqual([]);
  });

  it("accepts Supabase's name for Microsoft and ignores unknown providers", () => {
    expect(enabledAuthProviders("azure,myspace")).toEqual(["microsoft"]);
  });

  it("asks Microsoft for the email address", () => {
    expect(AUTH_PROVIDERS.microsoft).toMatchObject({ supabase: "azure", scopes: "email" });
  });
});
