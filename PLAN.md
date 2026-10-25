# REMAXX — Build Plan

**Status:** Draft for approval, revised Oct 21, 2026 with your answers to Q1–Q3 and Q6a. No app code written yet.
**Goal:** A community gallery of license-clean, AI-built templates + a browser editor where beginners remix them with Claude / ChatGPT / Gemini / DeepSeek and republish with credit.

---

## 1. Stack (confirmed, with three changes)

| Layer            | Choice                                                                                                                                                                                                                | Why                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App              | **Next.js (App Router, latest stable) + TypeScript strict + Tailwind**                                                                                                                                                | As recommended. Single app, no monorepo — less to maintain.                                                                                                                                                                  |
| UI kit           | Radix primitives + our own components (shadcn-style, copied in, not a dependency)                                                                                                                                     | Accessible by default, fully themeable to the REMAXX look.                                                                                                                                                                   |
| Database         | **Supabase Postgres + pgvector**                                                                                                                                                                                      | One vendor for DB, auth, and storage = one dashboard, one bill, fewer keys.                                                                                                                                                  |
| ORM / migrations | **Drizzle ORM + drizzle-kit**                                                                                                                                                                                         | Typed queries, plain SQL migrations checked into git.                                                                                                                                                                        |
| Auth             | **Supabase Auth** (email magic link + password, Google, GitHub) — _confirmed_                                                                                                                                         | Lives in the same Postgres, free up to 50k MAU, no per-seat pricing. Clerk is nicer UI but adds a second user store to sync.                                                                                                 |
| Storage          | **Supabase Storage** (private bucket for project files, public bucket for covers)                                                                                                                                     | Same vendor. Files stored content-addressed (by SHA-256) so a remix copies zero bytes until something changes. Can move to R2 later if egress costs grow.                                                                    |
| AI layer         | **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`, `/openai`, `/google`, `/deepseek`) behind our own `lib/ai` wrapper                                                                                                     | One streaming interface, structured output, token usage reporting. Adding a model = one entry in `config/models.ts`.                                                                                                         |
| Embeddings       | OpenAI `text-embedding-3-small` (1536-dim)                                                                                                                                                                            | Cheap, good quality. Dimension is fixed in the schema; switching providers later means a re-embed script (provided).                                                                                                         |
| Code editor      | **CodeMirror 6** (via Sandpack's editor) — _changed from Monaco_                                                                                                                                                      | Monaco is ~2–3 MB and doesn't work on phones. CodeMirror is a fraction of the size, works on touch, and has a merge/diff view for reviewing AI edits. Mobile-first + fast load is the reason.                                |
| Preview runtime  | **Two modes — changed from "WebContainers or Sandpack"**: (a) static HTML/CSS/JS served from a **separate preview domain** in an `<iframe sandbox="allow-scripts">`; (b) React projects via **Sandpack** (Apache-2.0) | WebContainers require a paid commercial license for for-profit production use and run Node in the browser, which we don't need. Most templates are static; React covers the rest. No uploaded code ever runs on our servers. |
| Rate limiting    | **Upstash Redis** + `@upstash/ratelimit` (in-memory fallback in dev)                                                                                                                                                  | Works on serverless; per-user and per-IP sliding windows.                                                                                                                                                                    |
| Moderation       | OpenAI Moderation API (free) for prompts, titles, descriptions, images + our own file scanner                                                                                                                         | See §5.                                                                                                                                                                                                                      |
| Payments         | **Stripe** (Checkout + Customer Portal + webhooks), test mode only                                                                                                                                                    | As recommended.                                                                                                                                                                                                              |
| Email            | Resend (for auth emails + waitlist + notifications)                                                                                                                                                                   | Supabase's built-in mailer is rate-limited and not for production.                                                                                                                                                           |
| Voice            | Web Speech API (Chrome, Edge, Safari); button hidden where unsupported. Fallback STT provider later.                                                                                                                  | As recommended.                                                                                                                                                                                                              |
| Monitoring       | Sentry (errors), PostHog (product analytics) — Phase 6                                                                                                                                                                |                                                                                                                                                                                                                              |
| Tests            | **Vitest** for unit/integration against **PGlite** (in-process Postgres with pgvector), **Playwright** for e2e smoke                                                                                                  | CI needs no database service; money/permission logic runs against real SQL.                                                                                                                                                  |
| Deploy           | Vercel + GitHub Actions (lint, type-check, test, build)                                                                                                                                                               | As recommended.                                                                                                                                                                                                              |

**Supported project types in MVP:** `static` (HTML/CSS/JS, CDN libraries allowed) and `react` (single-page, npm deps resolved by Sandpack). No backends, no server code, no databases inside templates. Uploads that need a server are rejected with a friendly message.

---

## 2. Folder structure

```
remaxx/
├─ app/
│  ├─ (marketing)/            page.tsx (landing), waitlist
│  ├─ (legal)/                terms, acceptable-use, privacy, dmca  ← marked DRAFT
│  ├─ (auth)/                 login, auth/callback
│  ├─ (app)/
│  │  ├─ explore/             gallery + filters + vibe search
│  │  ├─ p/[slug]/            project detail, preview, files, lineage
│  │  ├─ u/[handle]/          creator profile / portfolio
│  │  ├─ upload/              upload wizard
│  │  ├─ remix/[projectId]/   editor
│  │  ├─ collections/  settings/  billing/  notifications/
│  ├─ admin/                  reports queue, users, usage, model costs
│  └─ api/
│     ├─ ai/edit  ai/explain  ai/estimate
│     ├─ search/  upload/  report/
│     └─ stripe/webhook/
├─ preview-host/              handlers that ONLY answer on the preview domain
├─ components/  ui/ gallery/ editor/ project/ layout/
├─ config/
│  ├─ models.ts               ← add a model here
│  ├─ plans.ts                ← all pricing, credits, tier→model access
│  ├─ licenses.ts             ← license catalog + remix compatibility rules
│  └─ limits.ts               ← file sizes, rate limits, timeouts
├─ lib/
│  ├─ ai/          registry, run (auth→rate limit→hold→call→settle), prompts, diff
│  ├─ credits/     ledger, pricing, holds
│  ├─ licensing/   chain, compatibility
│  ├─ auth/        session, permissions (canEdit, canPublish, isAdmin…)
│  ├─ db/          schema.ts, client.ts, queries/
│  ├─ storage/  upload/ (validate, unzip, scan)  moderation/  ratelimit/  search/  stripe/
├─ db/migrations/
├─ scripts/  seed.ts  seed-templates/ (25–30 original templates)  reembed.ts
├─ tests/    unit/ integration/ e2e/
├─ .github/workflows/ci.yml
├─ .env.example   README.md   PLAN.md
```

---

## 3. Data model

Users live in Supabase's `auth.users`; everything else is ours. All app tables have RLS **enabled with no public policies**, so the browser's anon key can't read or write them directly — every read/write goes through server code that calls tested permission helpers.

**People**

- `profiles` — id (= auth user id), handle (unique), display_name, avatar_url, bio, links, role (`user` | `admin`), created_at
- `follows` — follower_id, followee_id, created_at (PK both)
- `waitlist` — email, source, created_at

**Projects**

- `projects` — id, owner_id, slug, title, description, project_type (`static`|`react`), category, tool_used, style_notes, license_id, status (`draft`|`published`|`unpublished`|`removed`), visibility, cover_url, current_version_id, parent_project_id, parent_version_id, root_project_id, like_count, save_count, remix_count, published_at, created_at
- `project_versions` — id, project_id, number, message, created_by (`user`|`ai`), ai_message_id, created_at — immutable snapshots
- `project_files` — version_id, path, blob_sha256, size, mime (PK version_id+path)
- `blobs` — sha256, size, storage_key, scan_status — content-addressed, shared across versions/remixes
- `remix_lineage` — ancestor_id, descendant_id, depth — closure table, so "credit chain" and "remixes of this" are single queries
- `lineage_credits` — project_id, position, ancestor_project_id, ancestor_title, ancestor_owner_handle, ancestor_license_id — **snapshot taken at remix time** so credit survives renames/deletions
- `rights_attestations` — project_id, user_id, license_id, attested_text_version, ip_hash, created_at — proof of the "I own this / have permission" checkbox
- `licenses` — id, spdx_id, name, url, commercial_ok, derivatives_ok, attribution_required, share_alike, compatible_remix_license_ids[]
- `tags`, `project_tags`

**Social**

- `likes` — user_id, project_id
- `collections` — id, owner_id, name, is_default ("Saved"), visibility
- `collection_items` — collection_id, project_id
- `comments` — Phase 6, optional
- `notifications` — Phase 6

**Search**

- `project_embeddings` — project_id, version_id, model, embedding vector(1536), source_text, style_description, created_at — HNSW index; plus a generated `tsvector` on projects for keyword search

**AI**

- `ai_sessions` — id, user_id, project_id, created_at
- `ai_messages` — id, session_id, role, content, attachments, model_id, action (`edit`|`explain`), input_tokens, output_tokens, provider_cost_usd, credits_charged, proposed_changes (json), outcome (`accepted`|`rejected`|`partial`|`error`), latency_ms, created_at

**Money**

- `credit_accounts` — user_id, balance (cached), updated_at — row lock target for concurrency
- `credit_ledger` — **append-only** (UPDATE/DELETE blocked by trigger): id, user_id, delta (int), kind (`trial_grant`|`subscription_grant`|`topup`|`hold`|`release`|`spend`|`refund`|`expiry`|`admin_adjust`), ref_type, ref_id, idempotency_key (unique), meta, created_at. Invariant (tested): `balance == SUM(delta)`.
- `subscriptions` — user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end, cancel_at_period_end
- `stripe_events` — event id (PK), type, processed_at — webhook idempotency

**Trust & safety**

- `reports` — id, reporter_id (nullable for DMCA form), target_type, target_id, reason (`copyright`|`malware`|`leaked_code`|`nsfw`|`spam`|`other`), details, contact_email, status (`open`|`actioned`|`dismissed`), resolved_by, resolution_note, created_at
- `moderation_events` — subject, verdict, categories, created_at
- `admin_audit_log` — admin_id, action, target, before/after, created_at

---

## 4. How the AI + credits pipeline works (every AI endpoint)

1. **Auth** — signed-in user required.
2. **Rate limit** — per user + per IP, per tier (Upstash).
3. **Moderate** the prompt (and any image).
4. **Estimate** cost = max input tokens (project context + prompt) and max output tokens × model price from `config/models.ts`. Shown to the user _before_ expensive actions.
5. **Hold** — in one transaction: lock `credit_accounts`, refuse if balance < estimate (**hard stop at zero**), write a `hold` row.
6. **Call** the model with a timeout (AbortSignal, ~120s) and streaming.
7. **Settle** — write `spend` for actual usage and `release` for the unused hold; on provider error, release the full hold. Idempotency keys make retries safe.
8. **Log** tokens, provider cost, credits, latency to `ai_messages`.

AI edits come back as structured file changes (validated with Zod), shown as per-file diffs. Accept → new `project_version`. Undo → restore any previous version.

Credits formula (all knobs in `config/plans.ts`):
`credits = ceil(provider_cost_usd × markup / credit_value_usd)` — placeholder markup 2.5×, 1 credit = $0.01. See the cost-per-request table in the Phase 5 build notes.

---

## 5. Safety rules as built

- **Separate preview origin:** previews served only from a different registrable domain (e.g. `remaxxusercontent.com`), never `*.remaxx.ai`, with strict CSP, `sandbox="allow-scripts"` (no `allow-same-origin`, no top navigation, no forms to our domain). No cookies ever set on that domain.
- **Uploads:** extension + magic-byte allowlist (html, css, js, jsx, ts, tsx, json, md, svg, png, jpg, webp, gif, woff2, txt). Limits: 25 MB zip, 50 MB unpacked, 500 files, 5 MB per file. Zip-bomb and path-traversal checks. Reject executables, archives-in-archives, `.env` / key-looking files.
- **Abuse scan (heuristic):** flags crypto-miner signatures, credential-harvesting forms posting off-site, heavy obfuscation (`eval` of long encoded strings), known-bad hosts. Flagged → held for admin review, not auto-published.
- **Moderation** on titles, descriptions, tags, cover images, and every prompt.
- **License + attestation** required before publish; remixes can only pick licenses allowed by the whole ancestor chain.
- **Report button** on every project/profile; public **DMCA form**; admin queue can unpublish instantly; owners notified.
- **Keys** only in server env vars; no `NEXT_PUBLIC_` AI keys; a CI check greps the client bundle for key patterns.
- **ToS / Acceptable Use / Privacy / DMCA** pages ship with a visible "DRAFT — pending legal review" banner.

---

## 6. Phase checklist

**Phase 1 — Foundation**

- [x] Scaffold, strict TS, ESLint, Prettier, Tailwind design tokens (dark theme, REMAXX wordmark, type scale, card styles)
- [x] Supabase project wiring, Drizzle schema for profiles/waitlist, first migrations
- [x] Auth: email + Google + GitHub, profile creation with handle on first login
- [x] Base layout (mobile-first nav), one-screen landing page with waitlist + sign-up CTA
- [x] Storage buckets + upload helper; preview-domain routing skeleton
- [x] Legal page stubs (DRAFT banners)
- [x] GitHub Actions CI; `.env.example`; README v1
- [x] Tests: permission helpers, handle validation

**Phase 2 — Gallery**

- [x] Full project/version/file/license/tag/social schema
- [x] Upload wizard: zip / folder / single HTML, cover, metadata, license, rights checkbox; validation + scan + moderation
- [x] Project page: big sandboxed preview, file browser, credit chain, report button
- [x] Likes, saves/collections, follows; explore grid with filters (tool, category, style, license)
- [x] Report + admin review queue (basic), unpublish
- [x] Seed: 25–30 original templates I write, varied aesthetics, 29 templates under a REMAXX Studio account across six licenses, including a three-generation remix chain, with screenshot covers
- [x] Tests: license compatibility + credit chain, upload validator, permissions

**Phase 3 — Vibe Search**

- [x] AI-written style description per project (from code; hand-written for the seed), embeddings on publish and in the background
- [x] Hybrid search: vector similarity + keyword + filters, blended score
- [x] "Why it matched" chips (matched styles, category, tags, words, vibe)
- [x] "More like this" on every project page
- [x] Tests: ranking blend on a fixed fixture set (the 29 starter templates), indexer, search and similarity on Postgres + pgvector

**Phase 4 — Remix Editor**

- [x] Remix → new draft + lineage rows + credit snapshot
- [x] Editor: file tree, CodeMirror, live preview, prompt panel (side by side on desktop; tabbed on mobile)
- [x] Model registry + picker (Claude, ChatGPT, Gemini, DeepSeek); image upload disabled for models without vision
- [x] Voice input (Web Speech API)
- [x] AI edit → per-file diff review → accept / reject / undo; version history
- [x] "Break it down": plain-English walkthrough of stack, files, and logic (cached per version)
- [x] Rate limits, timeouts, moderation on every AI route (credits stubbed until Phase 5)
- [x] Tests: diff application, AI pipeline with mocked providers

**Phase 5 — Publish & Credits**

- [x] Publish remix with auto credit chain + license guard
- [x] Ledger, holds, settlement, balance display, pre-action cost estimate, hard stop
- [x] Free trial prompts, paywall, Stripe Checkout + Portal + webhooks (test mode), monthly grants
- [x] Tier → model access enforcement; Power tier gets higher rate limits/concurrency
- [x] Tests: ledger invariant, concurrent spends, webhook idempotency, refund on failure, tier gating
- [x] Billing fallback: returning from checkout (and a "Refresh from Stripe" button) reads the subscription straight from Stripe, so a missed webhook can't leave a paid plan without credits
- [x] **Create:** a Create button in the header and `/create` page. Describe a project (the description waits in the editor's chat) and start from one of five original starters (blank, landing page, portfolio, link page, small app). It starts as a private draft and publishes with any license, plus the upload rights statement
- **Decided Oct 25, 2026: GPT only for now.** The Claude, Gemini and DeepSeek keys are deferred past Phase 6. The editor offers OpenAI models only until those keys are added (adding one is just its env var; check the model IDs and prices in `config/models.ts` against the provider's pricing page first).

**Phase 6 — Polish & Launch**

- [ ] Creator portfolios, trending/new/staff-picks, notifications
- [ ] SEO + dynamic Open Graph image per project
- [ ] Admin dashboard: reports, users, credit/usage, model cost vs revenue
- [ ] Sentry, PostHog, accessibility pass (WCAG AA), mobile pass, Lighthouse budget
- [ ] Final legal pages (still DRAFT), deployment guide, Playwright smoke suite in CI

**Phase 2 build notes (decided while building, cheap to change later):**

- Uploads are static sites only (HTML/CSS/JS/images/fonts/media). React/Vue/TS source is asked for its build output; Sandpack-powered React projects arrive with the editor in Phase 4.
- Upload size is 4 MB because uploads pass through a Vercel function (4.5 MB body limit). Direct-to-storage uploads can lift this.
- Project files and covers are stored in Postgres (content-addressed `blobs`), not Supabase Storage, so setup needs no buckets yet. `blobs.storage_key` is the migration path.
- Seed templates belong to an official @remaxx_studio account and start with zero likes: no fake engagement.

**Phase 3 build notes:**

- Descriptions are written from code, not from the cover image: cheaper, and code is what the clues come from. Image-aware descriptions can be added by passing the cover to a vision model.
- Search is open to signed-out visitors (the gallery is public). It costs REMAXX a fraction of a cent per new query, is rate-limited per IP, and is never charged to user credits; credits apply to editor AI calls from Phase 4.
- Without `OPENAI_API_KEY` everything still works with word matching; adding the key later fills in embeddings automatically.
- `OPENAI_BASE_URL` can point the platform AI calls at an OpenAI-compatible gateway.

**Phase 4 build notes:**

- The editor works on private drafts only. Published projects change by remixing them, so nothing goes public without the publish step (Phase 5) and its checks.
- Until credits exist, AI features are open to admins only (`AI_ACCESS=admins`), with a per-person daily cap and a site-wide daily budget in `config/limits.ts`. Set `AI_ACCESS=signed-in` to open it up.
- Live preview bundles the project in the browser and renders it in a sandboxed runner on the preview origin; ES module imports between local files and multi-page navigation beyond plain links are the known limits.
- Model IDs and prices for Google and DeepSeek come from third-party summaries (October 2026); check each provider's pricing page before Phase 5 turns costs into credits.
- Remix counts now include published remixes only (recounted by trigger when status changes).

**Phase 5 build notes:**

- Typical cost per AI request at 2.5× markup (from `config/models.ts` prices; actual charges are often lower because they use real token counts):

| Model             | Plan     | Small edit (~8 KB project) | Large edit (~40 KB) | Break it down | Small edits per month on Starter / Pro |
| ----------------- | -------- | -------------------------- | ------------------- | ------------- | -------------------------------------- |
| DeepSeek          | Starter+ | 2                          | 2                   | 1             | ~300 / ~900                            |
| Claude Haiku      | Starter+ | 2                          | 4                   | 2             | ~300 / ~900                            |
| Gemini Flash      | Starter+ | 3                          | 5                   | 3             | ~200 / ~600                            |
| ChatGPT mini      | Starter+ | 4                          | 6                   | 3             | ~150 / ~450                            |
| Claude Sonnet     | Pro+     | 8                          | 13                  | 6             | — / ~225                               |
| Gemini Pro        | Pro+     | 10                         | 14                  | 7             | — / ~180                               |
| ChatGPT (GPT-5.5) | Pro+     | 24                         | 35                  | 16            | — / ~75                                |

- Holds cover the worst case (the model's full output limit); the person is only charged the actual cost. If the balance can pay the typical cost but not the worst case, the hold is capped at the balance, so nobody is blocked by an unlikely maximum.
- Plans are only sold to people who can use AI. While `AI_ACCESS=admins`, only admins can check out, which keeps test-mode Stripe from unlocking real AI spend for anyone.
- Stripe products and prices are created from `config/plans.ts` on first checkout (lookup key `remaxx_<plan>_monthly_v<priceVersion>`), so there are no price IDs to copy. The publishable key isn't needed: checkout and billing management use Stripe's hosted pages.
- Publishing a remix uses the same hourly limit as uploads and the same scanner and moderation; flagged remixes are held for review.
- Credits are charged for "Break it down" only when a version hasn't been explained yet; cached explanations are free.

---

## 7. Keys you'll need to supply (by phase)

| Phase | Keys                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`; Google + GitHub OAuth apps (entered in the Supabase dashboard, not env); `RESEND_API_KEY` |
| 2     | `NEXT_PUBLIC_PREVIEW_ORIGIN` (the second domain)                                                                                                                                                    |
| 3     | `OPENAI_API_KEY` (embeddings + moderation)                                                                                                                                                          |
| 4     | `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                       |
| 5     | `STRIPE_SECRET_KEY` (test, `sk_test_...`), `STRIPE_WEBHOOK_SECRET` (`whsec_...`). Later: the remaining Phase 4 model keys (see the Phase 5 follow-up)                                               |
| 6     | `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`                                                                                                                                                             |

Until keys arrive I can build and test everything against PGlite and mocked providers.

---

## 8. Questions (expensive to undo)

**All decided Oct 21, 2026.** Plan approved. Phases 1–5 complete.

**Q1. Auth provider — DECIDED:** Supabase Auth.

**Q2. Billing — DECIDED: defaults as written, no top-up packs at launch.**

- a. Free tier = **2 free prompts** on a cheap model, **sign-up + verified email required** (no card). Blocks anonymous abuse.
- b. Monthly subscription credits **expire at period end**. Top-up packs are not in the launch scope (the ledger already supports a `topup` kind, so adding them later is a config + Stripe price change).
- c. Markup 2.5× over provider cost, 1 credit = $0.01. Placeholder plans: Starter $14 / 600 cr, Pro $34 / 1,800 cr, Power $89 / 5,500 cr. Annual plans: later.
- d. Failed or timed-out AI calls are fully refunded; rejected-but-successful edits are still charged (the model did the work).
- e. "Priority processing" for Power = higher rate limits and concurrent requests (there's no real queue to jump with direct API calls).

**Q3. License rules — DECIDED: catalog and rules as written; Personal Use templates are remixable, and their remixes must stay Personal Use.**

- Allowed on upload: MIT, Apache-2.0, CC-BY-4.0, CC-BY-SA-4.0, CC0, and "REMAXX Personal Use" (remix on REMAXX allowed, no commercial use).
- **No "No-Derivatives" licenses** — remixing is the whole point.
- Remix license must be compatible with every ancestor: CC0 → anything; MIT/Apache/CC-BY → anything, attribution kept; CC-BY-SA → stays CC-BY-SA; Personal Use → stays Personal Use.

**Q4. Takedown cascade — DECIDED:** when an original is removed for copyright, its descendants are **hidden pending admin review** (not auto-deleted), and their credit line shows "original removed."

**Q5. Minimum age — DECIDED:** **18+** at launch. Sign-up requires an age confirmation checkbox, recorded with the terms acceptance.

**Q6. Logistics — DECIDED:**

- a. Code lives in `github.com/Poopybaby/remaxxai` (private).
- b/c. `remaxx.ai` and a preview domain (e.g. `remaxxusercontent.com`) will be bought on GoDaddy. Until then, dev uses `localhost:3000` for the app and `127.0.0.1:3000` as the stand-in preview origin; both are env-configurable (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PREVIEW_ORIGIN`).

**Notes for your lawyer** (not blocking): register a DMCA designated agent with the U.S. Copyright Office to get safe-harbor protection; DeepSeek's API processes data in China, which the Privacy Policy should disclose (I'll label it in the model picker too); ToS should include the license users grant REMAXX to host and display uploads.
