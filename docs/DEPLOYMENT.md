# Deploying REMAXX

How to take REMAXX from an empty account to a running site, how to update it, and what to finish before charging real money. Every step is done in a web dashboard; nothing needs a terminal except the optional local setup.

After any change to settings, redeploy on Vercel and open **`/api/health`**. It reports every setting (yes/no only, never the values) and tells you in plain words what's wrong.

## 1. Accounts you need

| Service                                                     | What it does for REMAXX                                        | Needed                    |
| ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| [Vercel](https://vercel.com)                                | Hosts the app and the preview domain                           | Yes                       |
| [Supabase](https://supabase.com)                            | Database, sign-in                                              | Yes                       |
| GitHub                                                      | The code (Vercel deploys every push to `main`)                 | Yes                       |
| [OpenAI](https://platform.openai.com)                       | Moderation, vibe search, the AI editor                         | Yes, with a small balance |
| [Stripe](https://stripe.com)                                | Plans and credits                                              | To sell plans             |
| [Upstash](https://upstash.com)                              | Shared rate limits across servers                              | Before launch             |
| [Resend](https://resend.com)                                | Sign-in emails (Supabase's built-in mailer is heavily limited) | Before launch             |
| [Sentry](https://sentry.io), [PostHog](https://posthog.com) | Error reports, product analytics                               | Optional                  |
| Anthropic, Google AI Studio, DeepSeek                       | More models in the editor                                      | Optional, later           |

## 2. Database (Supabase)

1. Create a Supabase project. Copy from **Project Settings → API Keys**: the project URL, the publishable key and the secret key. Copy the **Transaction pooler** connection string (port 6543) from **Connect**.
2. **SQL Editor:** paste the newest `remaxx-setup-*.sql` (generate it with `pnpm db:setup-sql`) and click **Run**. It's safe to run again: it skips what's already applied and repairs common starter-template leftovers. Then run the seed SQL (`pnpm seed:sql`) once for the starter gallery.
3. **Auth → URL Configuration:** Site URL = your app URL; add `https://<app domain>/auth/callback` to Redirect URLs.
4. **Auth → Emails → Templates:** paste the templates from [email-templates.md](email-templates.md).
5. **Auth → SMTP:** connect Resend (or another sender) before launch.
6. Google, Microsoft and Apple sign-in: see section 2a.

## 2a. Sign-in providers (Google, Microsoft, Apple)

Each provider needs an app on that company's developer site. All of them use the same **callback URL**, which Supabase shows at the top of each provider's settings (**Auth → Sign In / Providers**). It looks like `https://<project>.supabase.co/auth/v1/callback`. After switching a provider on in Supabase, add it to `NEXT_PUBLIC_AUTH_PROVIDERS` in Vercel (e.g. `google,microsoft,apple`) and redeploy; its button then appears on `/login` and `/signup`. People who sign in with a provider skip the email step, since the provider already verified their address.

**Google** (most people have one)

1. [Google Cloud Console](https://console.cloud.google.com) → create a project → **APIs & Services → OAuth consent screen**: External, app name REMAXX, your support email, and your domain under authorized domains. Publish it when you're ready for everyone (in testing it only works for test users you list).
2. **Credentials → Create credentials → OAuth client ID** → Web application. Authorized redirect URI: the Supabase callback URL.
3. Copy the client ID and client secret into Supabase → Providers → **Google**, and switch it on.

**Microsoft** (Outlook, Hotmail, Xbox and work/school accounts)

1. [Azure portal](https://portal.azure.com) → **Microsoft Entra ID → App registrations → New registration**. Name REMAXX. Supported account types: _Accounts in any organizational directory and personal Microsoft accounts_. Redirect URI: Web, the Supabase callback URL.
2. **Certificates & secrets → New client secret**. Copy its **Value** right away (it's shown once). Note when it expires and set a reminder to renew it.
3. Supabase → Providers → **Azure** (Supabase's name for Microsoft): paste the Application (client) ID and the secret value, leave the tenant URL empty, and switch it on.

**Apple** (popular with iPhone users; optional)

1. Needs a paid [Apple Developer Program](https://developer.apple.com/programs/) membership.
2. In **Certificates, Identifiers & Profiles**: an App ID with _Sign in with Apple_, a **Services ID** (this is the client ID) configured with your domain and the Supabase callback URL as the return URL, and a **Key** with _Sign in with Apple_ (download the `.p8` file once).
3. Supabase → Providers → **Apple**: follow Supabase's Apple guide to turn the key into the client secret. That secret expires every six months, so set a reminder to regenerate it.

**Button logos.** Google, Microsoft and Apple each publish official sign-in button artwork and ask that it's used as provided. Download it from their branding pages and save it as `public/brand/google.svg`, `public/brand/microsoft.svg` and `public/brand/apple.svg`; the buttons pick the files up automatically on the next deploy. Without them the buttons show the provider's name only.

## 3. Hosting (Vercel)

1. Import the GitHub repo as a Vercel project. Use one project only; delete stray duplicates so settings don't end up on the wrong one.
2. **Domains:** the app domain (e.g. `remaxx.ai`) and a **second, separate domain** for previews (e.g. `remaxxusercontent.com`, or a second `*.vercel.app` name). Previews of user projects only ever run there, so they can never read the app's cookies.
3. **Settings → Environment Variables** (Production), from [.env.example](../.env.example):
   - Required: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PREVIEW_ORIGIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `DATABASE_URL`, `OPENAI_API_KEY`
   - Keep `AI_ACCESS=admins` until you open AI to everyone (see section 6)
   - Payments: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (section 4)
   - Before launch: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
   - Optional: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`
4. Redeploy and check `/api/health`. Every line should start with `ok` (or say "optional").
5. Sign up on the site, then make yourself an admin: in Supabase's SQL Editor run `update profiles set role = 'admin' where handle = 'your_handle';` (or `pnpm db:make-admin your_handle` locally). `/admin` appears in your account menu.

## 4. Payments (Stripe, test mode first)

1. In Stripe, stay in **Test mode**. **Developers → API keys:** copy the secret key (`sk_test_...`) into `STRIPE_SECRET_KEY`.
2. **Developers → Webhooks → Add endpoint:**
   - URL: `https://<app domain>/api/stripe/webhook`, exactly. Use a domain that doesn't redirect (Stripe doesn't follow redirects). If `remaxx.ai` redirects to `www.remaxx.ai`, use the `www` one, or the `*.vercel.app` URL.
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`
   - Copy its **signing secret** (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`.
3. Redeploy. `/api/health` → `payments: ok: test mode`.
4. As an admin, buy a plan on `/pricing` with card `4242 4242 4242 4242`, any future date and CVC. `/billing` shows the plan and credits (it also asks Stripe directly when you come back, so credits arrive even if the webhook is slow).
5. Then check `/api/health` → `stripeWebhook: ok: last received ...`, or `/admin` → "Last webhook from Stripe". **"never" means renewals won't add credits**: open the endpoint in Stripe and look at the response code of the latest attempts:
   - `400`: the signing secret doesn't match this endpoint.
   - `503`: `STRIPE_WEBHOOK_SECRET` isn't set, or you didn't redeploy.
   - `3xx`: the URL redirects; use the final URL.
   - No attempts: the events aren't selected.

Products, prices and the customer billing page are created automatically from `config/plans.ts`.

## 5. Updating the site

- Every push to `main` runs CI (lint, types, tests, build, a browser smoke test) and deploys on Vercel.
- When a release adds database changes, it comes with a new `remaxx-setup-*.sql`. **Run it in Supabase before the code deploys.** The SQL only adds things, so it's always safe on the older code.
- Changing prices: edit `config/plans.ts` and bump that plan's `priceVersion`. Existing subscribers keep their price until they change plan.
- Adding a model: see "How to add an AI model" in the [README](../README.md).

## 6. Before charging real money (launch checklist)

- [ ] **A lawyer reviews** the Terms, Acceptable Use Policy, Privacy Policy and copyright page. Then set `LEGAL_PAGES_ARE_DRAFTS = false` in `config/legal.ts` and bump the versions there.
- [ ] **Register a DMCA designated agent** with the U.S. Copyright Office (copyright.gov/dmca-directory) and add the details to `/legal/dmca`.
- [ ] Real email sender connected in Supabase (Auth → SMTP).
- [ ] Upstash set, so rate limits are shared across servers (`/api/health` → `rateLimitStore: ok`).
- [ ] Check the model prices in `config/models.ts` against each provider's pricing page; credits are computed from them.
- [ ] Stripe **live mode**: a live secret key, a live-mode webhook endpoint with its own signing secret, and `STRIPE_ALLOW_LIVE=true`. Stripe's checklist (business details, statement descriptor, tax) is done.
- [ ] `AI_ACCESS=signed-in`, which opens AI editing and plan sales to everyone. Watch `/admin` → "AI cost" for the first days; the site-wide daily budget is `AI_LIMITS.dailyBudgetUsd` in `config/limits.ts`.
- [ ] Optional but recommended: Sentry for errors; spending limits set on the OpenAI account.
