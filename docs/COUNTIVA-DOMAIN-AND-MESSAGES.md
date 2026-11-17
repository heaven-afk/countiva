# Countiva domain and customer messages

The canonical application origin is https://countiva.shop. At verification on 17 November 2026, it redirected to https://www.countiva.shop and both HTTPS addresses responded successfully. The app accepts requests from both variants when using the Countiva production origin. Generated signup, reset, team-invitation and new checkout-return links use the configured canonical origin, defaulting to https://countiva.shop.

## Vercel and Bachs settings

Set both APP_URL and NEXT_PUBLIC_APP_URL to https://countiva.shop in the production environment, then rebuild. Ensure countiva.shop and www.countiva.shop belong to the same Vercel project. Keep a single primary domain in Vercel. The request-origin check supports the current redirect to www.

In the Bachs dashboard, use https://countiva.shop/api/billing/webhook as the production webhook URL. Retain its existing signing secret or update the deployed secret to match if you rotate it. New checkouts generate success and cancel links under /workspace on the Countiva origin. Pending checkout sessions that were already created can retain their earlier return URL.

## Supabase settings

In Authentication → URL Configuration, set Site URL to https://countiva.shop. Allow these exact redirect URLs for the current apex-to-www configuration.

```text
https://countiva.shop/
https://countiva.shop/login
https://countiva.shop/reset-password
https://www.countiva.shop/
https://www.countiva.shop/login
https://www.countiva.shop/reset-password
```

Keep the existing localhost/127.0.0.1 entries used for development. During the transition, retain the old countiva.vercel.app entries so previously sent links can still finish on their original host. The code generates new links on the new domain, including when a deployment retains the old environment value. Existing sessions and unsynced device records are stored per website origin. Open the previous host to finish pending uploads before switching devices to the new address.

## Branded account emails

Copy each HTML file from supabase/email-templates into the corresponding Authentication → Email Templates editor. Copy its subject from subjects.json.

| Supabase template    | File                  |
| -------------------- | --------------------- |
| Confirm signup       | confirm-signup.html   |
| Reset password       | reset-password.html   |
| Magic link           | magic-link.html       |
| Invite user          | invite-user.html      |
| Change email address | change-email.html     |
| Reauthentication     | reauthentication.html |

The templates include the Countiva logo, off-white background, charcoal button, clear action and countiva.shop footer. Account links use Supabase's `{{ .ConfirmationURL }}` so verification occurs before the user returns to the application. Reauthentication displays `{{ .Token }}`. The Invite user template applies to Supabase account invitations. Business team invitations continue to use the owner-created share link.

In Authentication → SMTP Settings, set Sender name to **Countiva**. Set Sender email to a real address you have verified with the chosen SMTP provider. Verify the sender domain using the DNS records supplied by that provider. The templates do not create a mailbox or configure email delivery. Keep SMTP passwords and API keys in the provider settings.

Proposed sender addresses are notifications@countiva.shop for automated emails and hello@countiva.shop for customer conversations. These addresses still need setting up. Resend supports a free sending plan and Supabase SMTP. After verifying countiva.shop in Resend, its documented SMTP settings are host smtp.resend.com, port 465, username resend, and the Resend API key as the password. Enter that password directly in Supabase. Provider instructions are available in [Resend’s Supabase guide](https://resend.com/docs/send-with-supabase-smtp).

The app now brands signup confirmations, password-reset feedback, team-invitation instructions, and morning/evening push reminders as Countiva messages. Push reminders address the recipient by their signup name and identify the business.

## Verification

After deploying and applying hosted settings, create one test signup, confirm its email, request a fresh reset, and sign in with the new password. Inspect the sender and action URL. Open a new team invitation and a fresh Bachs test checkout to verify the return host. Browser push permissions and installation apply per origin, so enable them again on the new domain.

No database migration is required for these changes. Hosted settings, email delivery, and payment callbacks need the checks above after configuration.

Provider references are [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls) and [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
