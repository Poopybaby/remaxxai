# Supabase email templates

Paste these into **Supabase → Authentication → Emails → Templates**. They make sign-in links
work in any browser or device (they go to `/auth/confirm`, which verifies on the server) and
include a code people can type instead of clicking.

`{{ .SiteURL }}` is the **Site URL** from Authentication → URL Configuration, so set that to your
live address (for example `https://remaxxai.vercel.app`) first.

## Confirm signup

Subject: `Confirm your REMAXX account`

```html
<h2>Welcome to REMAXX</h2>
<p>Click to confirm your email and sign in:</p>
<p>
  <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email"
    >Confirm and sign in</a
  >
</p>
<p>Or type this code on the sign-in page: <strong>{{ .Token }}</strong></p>
<p>The link and code work once. If you didn't ask for this, ignore this email.</p>
```

## Magic Link

Subject: `Your REMAXX sign-in link`

```html
<h2>Sign in to REMAXX</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Sign in</a></p>
<p>Or type this code on the sign-in page: <strong>{{ .Token }}</strong></p>
<p>The link and code work once. If you didn't ask for this, ignore this email.</p>
```
