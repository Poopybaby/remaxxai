import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ isDbConfigured: () => false, getDb: () => null }));
const { signInErrorKey } = await import("@/lib/auth/after-sign-in");

const q = (s: string) => new URLSearchParams(s);

describe("signInErrorKey", () => {
  it("recognises an expired or already-used email link", () => {
    expect(
      signInErrorKey(
        q(
          "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
        ),
      ),
    ).toBe("expired");
  });
  it("treats a cancelled provider sign-in as denied", () => {
    expect(signInErrorKey(q("error=access_denied"))).toBe("denied");
  });
  it("falls back to a generic message", () => {
    expect(signInErrorKey(q("error=server_error"))).toBe("callback");
  });
});
