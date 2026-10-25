# REMAXX

A community gallery of AI-built templates plus a browser editor for remixing them. See [PLAN.md](./PLAN.md) for the architecture, data model and phase checklist.

**Status:** Phases 1 (Foundation) and 2 (Gallery) complete: auth, profiles, landing page, uploads with licenses and rights confirmation, sandboxed previews, source browser, likes, saves, follows, filters, reports, DMCA form, admin review queue, and 29 starter templates.

## Deploying

Step-by-step setup, updating, and the launch checklist: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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

| Variable                                              | Needed for                   | Where to get it                                                                                       |
| ----------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                                 | Links, metadata              | Your domain, e.g. `https://remaxx.ai`                                                                 |
| `NEXT_PUBLIC_PREVIEW_ORIGIN`                          | Sandboxed previews           | Your second domain, e.g. `https://remaxxusercontent.com`                                              |
| `NEXT_PUBLIC_SUPABASE_URL`                            | Auth, storage                | Supabase → Project Settings → API Keys                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                | Auth in the browser          | Same page (publishable / anon key)                                                                    |
| `SUPABASE_SECRET_KEY`                                 | Storage admin (server)       | Same page (secret / service_role key)                                                                 |
| `DATABASE_URL`                                        | Everything with data         | Supabase → Connect → connection string                                                                |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`  | Shared rate limits           | Upstash console (optional until launch)                                                               |
| `OPENAI_API_KEY`                                      | Moderation, vibe search      | platform.openai.com (optional; without it uploads are marked unchecked and search matches words only) |
| `ANTHROPIC_API_KEY`                                   | Claude in the editor         | console.anthropic.com → API Keys (optional; Claude models show "not set up" without it)               |
| `GOOGLE_GENERATIVE_AI_API_KEY`                        | Gemini in the editor         | aistudio.google.com → Get API key (optional)                                                          |
| `DEEPSEEK_API_KEY`                                    | DeepSeek in the editor       | platform.deepseek.com → API keys (optional)                                                           |
| `AI_ACCESS`                                           | Who can use AI features      | `admins` (default) or `signed-in`. Plans are only sold to people who can use AI                       |
| `STRIPE_SECRET_KEY`                                   | Selling plans                | Stripe → Developers → API keys. Test key (`sk_test_...`) until launch                                 |
| `STRIPE_WEBHOOK_SECRET`                               | Credits after payment        | Stripe → Developers → Webhooks → endpoint → Signing secret (`whsec_...`)                              |
| `STRIPE_ALLOW_LIVE`                                   | Real charges                 | Leave unset. Live keys are refused unless this is `true`                                              |
| `NEXT_PUBLIC_SENTRY_DSN`                              | Error reports (optional)     | sentry.io → Project → Settings → Client Keys (DSN). Off when unset                                    |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Product analytics (optional) | posthog.com → Project settings → Project API key. Off when unset                                      |
| `VIBE_DESCRIBE_MODEL`                                 | Style descriptions           | Optional; defaults to `gpt-5-mini`                                                                    |

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

## How vibe search works

- Every published project has a row in `project_search`: a plain-language **look and feel** description, the text search matches against (title, description, category, tool, style and topic tags, look and feel), and an embedding of that text (`text-embedding-3-small`, pgvector).
- Look-and-feel descriptions are hand-written for starter templates (`seed/vibes.ts`). For uploads, `lib/search/hints.ts` reads the CSS/HTML for clues (dark background, frosted glass, hard shadows, serif type...) and a small model turns code + clues into two or three sentences. With no AI key, the clues alone become the description.
- A search embeds the query (cached, rate-limited, 4-second timeout), gathers candidates by vector similarity and by full-text words, then `lib/search/rank.ts` blends vibe similarity (55%), word coverage (40%) and a small popularity nudge (5%). The same function produces the "why it matched" chips. Everyday words map onto filters: "glassmorphism" counts as Glassy, "admin" as Dashboard.
- If the AI side is missing, slow or rate-limited, search quietly falls back to words only, and says so.
- Indexing runs in the background after uploads, approvals and searches, and only does missing work. Admins see the index status and an "Index missing now" button on `/admin`.
- Tuning: weights and thresholds live at the top of `lib/search/rank.ts`; `tests/unit/search-rank.test.ts` pins the expected top result for real queries over the starter templates.

## Moderation

- Reports and DMCA notices land in `/admin` (admins only). Admins can dismiss a report, remove a project, or approve held uploads.
- A copyright removal also hides that project's published remixes until an admin reviews them, and their credit line shows "original removed".

## How the remix editor works

- **Remix** copies a published project into a private draft (`lib/projects/remix.ts`): same files (no bytes copied, blobs are shared by hash), credit to every ancestor, and the most permissive license the chain allows. Drafts only count as remixes once they're published.
- **The editor** (`/edit/<id>`) has a chat panel (text, voice through the browser's speech recognition, reference images, model picker) and a workspace with a live preview and a CodeMirror code view.
- **Live preview:** the project is bundled into one page in the browser (`lib/editor/bundle.ts`) and posted to a blank runner page on the preview origin (`<preview origin>/run`), which runs under the same sandbox as published previews. Unsaved edits show instantly; nothing runs on the app origin.
- **AI edits** go through one pipeline (`lib/ai/pipeline.ts`): sign-in and `AI_ACCESS`, model set up, per-minute rate limit, per-person daily cap, site-wide daily budget, one request at a time, prompt moderation, then the model call with a timeout. Every attempt is logged in `ai_messages` with tokens and estimated cost.
- Models answer in a small text format (`lib/ai/edit-protocol.ts`): SEARCH/REPLACE edits or whole-file writes. The answer is parsed and applied to a copy of the files, path-checked (no escaping the project, no touching images), and shown as a per-file diff. Nothing is saved until the person applies it.
- **Versions:** every save, accepted AI change and restore is a new numbered version (`lib/projects/versions.ts`). Undo restores the previous version as a new one, so nothing is lost. Saves are rejected if the draft changed in another tab, and a draft can only reuse files from its own history.
- **Break it down** (`/api/explain`) writes a plain-English tour of a version and caches it, so each template is explained once and then free to read for everyone.
- **Create** (`/create`, `lib/projects/new-project.ts`) starts a private draft from one of the original starters in `lib/projects/starters.ts` (blank page, landing page, portfolio, link page, small app). If the person describes what they want, the description waits in the editor's chat; nothing is sent (or charged) until they press Send. Creating shares the remix rate limit and the 50-draft cap.
- **Publish** (`/edit/<id>/publish`, `lib/projects/publish.ts`) turns a draft into a gallery template. It runs the same checks as an upload (secret scanner, moderation of the text and cover), only offers licenses the whole credit chain allows (a CC BY-SA ancestor keeps every remix CC BY-SA; Personal Use stays Personal Use), records the person's rights confirmation, and keeps the "Remixed from" credit, which can't be removed. Flagged remixes are held for review.
- Limits live in `config/limits.ts` (`AI_LIMITS`). Admins see today's AI usage and spend on `/admin`.

## How credits and plans work

- **One file for pricing:** [`config/plans.ts`](config/plans.ts) has the plans (price, monthly credits, model tier, rate limits), the markup (2.5×), what a credit is worth ($0.01) and the free prompts (2). Change a plan's price by editing it and bumping its `priceVersion`; Stripe prices can't be edited, so a new version makes a new price.
- **Ledger:** every grant, hold, spend, refund, expiry and admin adjustment is an append-only row in `credit_ledger` (updates and deletes are refused by the database). `credit_accounts.balance` is kept in the same transaction and can never go below zero. Every row has a unique idempotency key, so retried webhooks and requests can't apply twice.
- **An AI request** (`lib/ai/pipeline.ts` → `lib/billing/credits.ts`): the editor shows an estimate first. The server holds up to the maximum the request could cost, calls the model, then charges the actual cost (never more than the hold) and releases the rest. Failures, timeouts and unusable answers are refunded in full. With no credits left, requests stop (a free prompt is used instead if one is left, on Starter-tier models).
- **Plans:** Starter gets the low-cost models; Pro and Power get every model. Power's priority is more requests per minute and two at once. Credits arrive when Stripe reports the invoice paid and expire when the next period starts. Upgrading mid-period adds the difference straight away; downgrades apply next period; cancelling ends the plan (and its credits) at the period end.
- **Who can buy:** only people who can use AI (`AI_ACCESS`). With `AI_ACCESS=admins`, only admins see working plan buttons, so you can test checkout without anyone paying for something they can't use.
- **Admin:** `/admin` shows credits charged this month against estimated provider cost, and lets admins add or remove credits by handle (recorded in the ledger with a note).

## Stripe setup (test mode)

1. In Stripe, stay in **Test mode**. Developers → API keys → copy the **Secret key** (`sk_test_...`) into `STRIPE_SECRET_KEY` on Vercel.
2. Developers → Webhooks → **Add endpoint**: URL `https://<your app domain>/api/stripe/webhook`, events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`. Copy its **Signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
3. Redeploy, then check `/api/health`: `payments` should say `ok: test mode`.
4. As an admin, open `/pricing`, pick a plan and pay with card `4242 4242 4242 4242`, any future date, any CVC. `/billing` should show the plan and its credits within a few seconds.
5. Products, prices and the customer billing page (cancel, change card, invoices) are created automatically on first use.

Going live later means a live key plus `STRIPE_ALLOW_LIVE=true`, a live-mode webhook, and `AI_ACCESS=signed-in`. Don't do it before the Terms and Privacy pages have had a lawyer's review.

## Monitoring and analytics

- Both are optional and off until their key is set; the SDKs load lazily after the page is interactive, so they never slow the first load.
- **Sentry** (`instrumentation.ts`, `instrumentation-client.ts`): server errors through Next's `onRequestError`, browser errors through the SDK. Collection is locked down (`sentryDataCollection()` in `lib/monitoring/scrub.ts`: no cookies, bodies, AI prompts, database values or stack-frame variables), and every report also passes `scrubSentryEvent`. No session replays. Source maps aren't uploaded yet; add `withSentryConfig` and a `SENTRY_AUTH_TOKEN` when readable stack traces are worth it.
- **PostHog** (`lib/monitoring/analytics.ts`): page views plus six events (`project_created`, `remix_started`, `ai_prompt_sent`, `ai_change_applied`, `published`, `checkout_started`). Memory-only persistence (no cookies, no consent banner needed), no person profiles, no recordings, Do Not Track respected, URLs scrubbed. Events never carry typed text. Add one by extending `AnalyticsEvent` and calling `track()`.

## How to add an AI model

1. Add one entry to `MODELS` in [`config/models.ts`](config/models.ts): a stable `id`, the `label` people see, the `provider`, the provider's `apiModel` name, whether it reads images (`vision`), its plan `tier`, and its price per million input/output tokens.
2. If it's from a provider that's already supported (Anthropic, OpenAI, Google, DeepSeek), that's all: it appears in the picker once that provider's key is set.
3. A new provider needs an adapter in [`lib/ai/providers.ts`](lib/ai/providers.ts) (request shape, response parsing, error mapping), its key in `lib/env.ts` and `lib/ai/server.ts`, an entry in `PROVIDERS` in `config/models.ts`, and a test in `tests/unit/ai-providers.test.ts`.
4. Provider renamed a model? Update its `apiModel` and redeploy. The model's `id` stays the same, so history and usage stay linked.
