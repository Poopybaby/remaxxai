# REMAXX

A community gallery of AI-built templates plus a browser editor for remixing them. See [PLAN.md](./PLAN.md) for the architecture, data model and phase checklist.

**Status:** Phases 1 (Foundation) and 2 (Gallery) complete: auth, profiles, landing page, uploads with licenses and rights confirmation, sandboxed previews, source browser, likes, saves, follows, filters, reports, DMCA form, admin review queue, and 29 starter templates.

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript strict · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Upstash rate limiting · Vitest + PGlite · GitHub Actions · Vercel.

## Run it locally

Requirements: Node 22+ and pnpm 10 (`corepack enable` installs pnpm).

```bash
pnpm install
cp .env.example .env.local     # then fill in the values, see below
pnpm db:migrate                # create tables
pnpm storage:setup             # create storage buckets
pnpm seed                      # load the 29 starter templates
pnpm dev                       # http://localhost:3000
```

The app starts without any keys: the landing page and legal pages work, sign-in shows a "not set up" message and the waitlist says it isn't open yet. Add the Supabase keys to turn those on.

**Preview origin locally:** `http://localhost:3000` is the app and `http://127.0.0.1:3000` acts as the separate preview domain. They're different sites to the browser, so isolation works the same way it will in production.

## Environment variables

Everything is listed with instructions in [.env.example](./.env.example). Only `NEXT_PUBLIC_*` values reach the browser. AI and payment keys are server-only and CI fails the build if one shows up in the client bundle.

| Variable                                             | Needed for             | Where to get it                                                             |
| ---------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                | Links, metadata        | Your domain, e.g. `https://remaxx.ai`                                       |
| `NEXT_PUBLIC_PREVIEW_ORIGIN`                         | Sandboxed previews     | Your second domain, e.g. `https://remaxxusercontent.com`                    |
| `NEXT_PUBLIC_SUPABASE_URL`                           | Auth, storage          | Supabase → Project Settings → API Keys                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`               | Auth in the browser    | Same page (publishable / anon key)                                          |
| `SUPABASE_SECRET_KEY`                                | Storage admin (server) | Same page (secret / service_role key)                                       |
| `DATABASE_URL`                                       | Everything with data   | Supabase → Connect → connection string                                      |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Shared rate limits     | Upstash console (optional until launch)                                     |
| `OPENAI_API_KEY`                                     | Upload moderation      | platform.openai.com (optional now; uploads are marked unchecked without it) |

## Supabase setup (one time)

1. Create a project at [supabase.com](https://supabase.com) and copy the keys above into `.env.local`.
2. **Auth → URL Configuration:** set Site URL to your app URL and add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to Redirect URLs.
   **Auth → Emails → Templates:** paste the two templates in [docs/email-templates.md](docs/email-templates.md) so sign-in links work in any browser and include a typeable code.
   Google/GitHub sign-in: switch the provider on in Auth → Sign In / Providers, then set `NEXT_PUBLIC_AUTH_PROVIDERS=google,github`. The buttons stay hidden until you do.
3. **Auth → Sign In / Providers:** enable Email (magic link), Google and GitHub.
   - Google: create an OAuth client in Google Cloud Console; authorized redirect URI is the callback URL Supabase shows you.
   - GitHub: GitHub → Settings → Developer settings → OAuth Apps → New, with the same Supabase callback URL.
4. **Auth → SMTP:** before launch, connect a real email sender (e.g. Resend). Supabase's built-in mailer is heavily rate-limited.
5. Run `pnpm db:migrate` and `pnpm storage:setup`. No terminal access to your database? Run `pnpm db:setup-sql`, paste the output into Supabase → SQL Editor and click Run; it does the same thing and is safe to run twice.
6. Load the starter templates: `pnpm seed`, or `pnpm seed:sql` and paste the output into the SQL Editor.
7. Make yourself an admin after you've signed up: `pnpm db:make-admin <your-handle>`.

## Scripts

| Command                                  | What it does                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                               | Dev server                                                                                                             |
| `pnpm build` / `pnpm start`              | Production build / serve it                                                                                            |
| `pnpm lint`                              | ESLint (no `any` without an explicit, commented disable)                                                               |
| `pnpm typecheck`                         | Generates route types, then `tsc --noEmit` (strict)                                                                    |
| `pnpm test`                              | Unit and integration tests. Integration tests run real SQL against an in-process Postgres (PGlite); no database needed |
| `pnpm db:migrate`                        | Applies new files in `db/migrations` to `DATABASE_URL`                                                                 |
| `pnpm db:make-admin <handle> [--revoke]` | Grants or removes the admin role                                                                                       |
| `pnpm storage:setup`                     | Creates or updates the storage buckets in `config/limits.ts`                                                           |
| `pnpm seed` / `pnpm seed:sql`            | Loads the starter templates into `DATABASE_URL`, or prints the SQL to paste. Safe to run again                         |
| `pnpm db:setup-sql`                      | Prints all migrations plus storage buckets as one SQL script for the Supabase SQL Editor                               |
| `pnpm check:bundle`                      | After a build, fails if a secret-looking value is in the browser bundle                                                |
| `pnpm verify`                            | Everything CI runs, in order                                                                                           |

## Project layout

```
app/            Routes (landing, explore, project pages, upload, profiles, saved, admin, legal, preview origin)
components/     UI kit, layout, gallery cards, project page pieces, landing visuals
config/         Site settings, legal versions, licenses and remix rules, tools/categories/styles, limits
lib/            auth, db, licensing (remix rules, credit chain), projects, upload (validate, scan), moderation, seed, security
db/migrations/  Plain SQL migrations, the source of truth for the schema
scripts/        migrate, seed, make-admin, storage setup, setup SQL, bundle secret scan
seed/           Starter template files and their catalog (titles, licenses, tags)
tests/          unit/ and integration/ (PGlite)
```

## How security is wired

- **No browser access to tables.** Every table has row level security on with no policies and no grants to the browser roles. The server talks to Postgres directly and checks permissions with the tested helpers in `lib/auth/permissions.ts`.
- **Sessions are verified.** `getClaims()` validates the Supabase JWT on every request; nothing trusts an unverified cookie.
- **Untrusted code never runs on the server.** Project previews are served as plain files from a separate domain with a `sandbox` CSP, and only ever run in the visitor's browser. The app domain refuses to be framed.
- **Rate limits** on every write endpoint (Upstash when configured, in-memory otherwise).

- **Uploads are untrusted.** Every file is checked by path, type, size and content (magic bytes, valid UTF-8), and scanned for leaked secrets (rejected) and malware or phishing patterns (held for admin review). Text and the cover image go through OpenAI moderation when a key is set.
- **Licenses are enforced.** Every upload needs a license and a rights confirmation, recorded per project. Remixes can only use licenses every ancestor allows (`config/licenses.ts`, tested in `tests/unit/licensing.test.ts`).

## How uploads and previews work

- Uploads are static sites: HTML, CSS, JS, images, fonts and media, up to 4 MB (Vercel's request limit). Projects that need a build step are asked to upload their build output.
- Files are stored once per unique content (by SHA-256) in Postgres, so remixes don't copy bytes. Larger files can move to object storage later through `blobs.storage_key`.
- Previews load from `<preview origin>/v/<version id>/<path>` inside a sandboxed iframe. Only published projects are served there.

## Moderation

- Reports and DMCA notices land in `/admin` (admins only). Admins can dismiss a report, remove a project, or approve held uploads.
- A copyright removal also hides that project's published remixes until an admin reviews them, and their credit line shows "original removed".

## Coming in later phases

How to add an AI model will be documented here with the remix editor (Phase 4).
