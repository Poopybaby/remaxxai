/** The two accounts the smoke tests sign in as (created by prepare-db.ts). */
export const E2E_USERS = {
  admin: {
    id: "e2e00000-0000-4000-8000-000000000001",
    email: "e2e-admin@example.com",
    handle: "e2e_admin",
    displayName: "E2E Admin",
    role: "admin",
  },
  member: {
    id: "e2e00000-0000-4000-8000-000000000002",
    email: "e2e-member@example.com",
    handle: "e2e_member",
    displayName: "E2E Member",
    role: "user",
  },
} as const;

/**
 * A Supabase session cookie for one of the test accounts. It only works against
 * e2e/support/fake-auth.mjs, which accepts any token; real Supabase verifies the signature.
 */
export function sessionCookie(user: keyof typeof E2E_USERS, supabaseUrl: string) {
  const u = E2E_USERS[user];
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims = { sub: u.id, email: u.email, role: "authenticated", aud: "authenticated", exp };
  const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.e2e`;
  const session = {
    access_token: token,
    token_type: "bearer",
    expires_in: 86_400,
    expires_at: exp,
    refresh_token: "e2e",
    user: { id: u.id, email: u.email, aud: "authenticated", role: "authenticated" },
  };
  // Supabase names the cookie after the first label of the project's host name.
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return {
    name: `sb-${ref}-auth-token`,
    value: `base64-${b64(session)}`,
    domain: "localhost",
    path: "/",
  };
}
