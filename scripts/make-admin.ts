/**
 * Grants or revokes the admin role for a profile.
 * Usage: pnpm db:make-admin <handle>          (grant)
 *        pnpm db:make-admin <handle> --revoke (revoke)
 */
import "./load-env";
import postgres from "postgres";

async function main() {
  const [handle, flag] = process.argv.slice(2);
  if (!handle) {
    console.error("Usage: pnpm db:make-admin <handle> [--revoke]");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const role = flag === "--revoke" ? "user" : "admin";
  const sql = postgres(url, { max: 1 });
  try {
    const rows =
      await sql`update profiles set role = ${role} where handle = ${handle.toLowerCase().replace(/^@/, "")} returning handle`;
    if (rows.length === 0) {
      console.error(`No profile with handle "${handle}".`);
      process.exitCode = 1;
    } else {
      console.log(
        `@${rows[0]!.handle} is now ${role === "admin" ? "an admin" : "a regular user"}.`,
      );
    }
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
