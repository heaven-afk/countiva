# Password-reset URL setup

Countiva's current public address is https://countiva.vercel.app. This update sends production reset requests to https://countiva.vercel.app/reset-password and provides a dedicated recovery page.

## Supabase dashboard

Under Authentication → URL Configuration:

1. Set Site URL to https://countiva.vercel.app.
2. Add https://countiva.vercel.app/reset-password to Redirect URLs.
3. Retain https://countiva.vercel.app/login and https://countiva.vercel.app/ while older confirmation/reset links are still in use.
4. For local testing only, add the exact addresses you use, for example http://127.0.0.1:3000/reset-password and http://localhost:3000/reset-password. Open local links on the computer running the development server.

Check Authentication → Email Templates → Reset Password. The standard reset link should use {{ .ConfirmationURL }}. Remove any hardcoded, deleted Vercel deployment address. If a custom token-hash template is desired, the application also supports:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

The token type must be recovery. Do not use the signup/email confirmation token type for password changes. PKCE callbacks use the verifier from the requesting browser; a missing verifier requires a fresh request in that browser. Default implicit recovery and a correctly configured token-hash email can be opened in another browser.

In Vercel, set NEXT_PUBLIC_APP_URL=https://countiva.vercel.app and rebuild if configuring this public variable. The same stable production address is the application's fallback; preview deployment addresses are not used for production reset emails. The server APP_URL setting for billing remains separate.

Deploy the code before testing the new route. Request a fresh reset email after changing the hosted URL settings; previously issued emails can retain their earlier destination or may already be expired/used. Never share a full reset URL or token publicly.

## What the code handles

- Dedicated /reset-password page with labelled password and confirmation fields.
- Supabase verification of implicit token, token-hash and PKCE recovery callbacks.
- Legacy recovery callbacks arriving on / or /login are forwarded without dropping their callback material.
- One verification attempt per page instance, including React development Strict Mode.
- A short-lived, tab-scoped recovery marker permits a refresh after callback credentials have been removed from the URL; the account is reverified with Supabase.
- Expired/invalid links show a soft-red error with a fresh-link form.
- A successful password change clears the password fields and signs out locally. If sign-out fails, the page offers a retry without submitting the password change again.
- Invalid credentials and other authentication errors use soft-red backgrounds/strokes and readable red text in both themes; reset-email confirmations retain neutral feedback.
- Installation guidance is shown only in Notifications.

No new database migration is required for this update. The earlier V2 migrations still apply to their corresponding subscription and receipt features.

## Verification

Automated tests cover stable/local redirect URLs, malformed and expired callbacks, all three recovery callback formats, PKCE recovery intent, account matching, tab-marker expiry and friendly credential errors. The production build checks the new route. Complete the live email/password round trip using a user-controlled account after the hosted URL/template settings are confirmed; this workflow was not tested by sending email or changing a live user's credentials.

Provider references:

- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail
- https://supabase.com/docs/reference/javascript/auth-verifyotp
- https://vercel.com/docs/errors/deployment_not_found

The Vercel DEPLOYMENT_NOT_FOUND screen indicates a missing deployment address, rather than an incorrect-password response. Updating an application route cannot repair an email that still points at a deleted deployment; its hosted redirect/template setting needs the current address.
