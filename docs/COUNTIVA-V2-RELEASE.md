# Countiva V2 release setup

The V2 source is implemented; live payments and reminders require the settings below. This version also needs migrations 007 (admin subscription management) and 008 (editable receipt details), applied after 006 before deployment. See [administration and receipt setup](ADMIN-SUBSCRIPTIONS-AND-RECEIPTS.md).

## Prices and access

| Category               | Access period | Upfront price | Features                                                                                  |
| ---------------------- | ------------- | ------------- | ----------------------------------------------------------------------------------------- |
| Monthly                | 1 month       | NGN 25,000    | Starter: owner + 2 users, 2 receipt templates, 20 scans/calendar month, 10 products/photo |
| Monthly                | 1 month       | NGN 45,000    | Growth: owner + 5 users, 4 receipt templates, 100 scans/calendar month, 40 products/photo |
| Monthly, blue Hot Plan | 3 months      | NGN 60,000    | Growth; available on every renewal                                                        |
| Annual                 | 6 months      | NGN 150,000   | Growth                                                                                    |
| Annual                 | 12 months     | NGN 350,000   | Growth                                                                                    |

Detailed report snapshots cost NGN 5,000 separately. These are the requested prices: four Hot Plan renewals cost less than the annual offer. The interface does not claim the annual offer is the cheapest.

NGN access periods use one-time Bachs checkout and manual renewal. No automatic debit is promised. A renewal or plan change is appended after existing paid access, with no credit or proration. A queued Starter downgrade caps invitations at three people. Existing businesses retain Starter access during rollout until their first verified purchase; existing team members are not silently deleted. Review and retire `legacy_billing_access` grants as part of your migration policy.

## Deployment order

1. Back up the Supabase database and export device records with pending saves. Rehearse on a Supabase staging project first.
2. Apply migrations 001-005 if not already installed, then run `supabase/migrations/006_countiva_v2.sql` once through the Supabase SQL editor or migration pipeline. The existing `upgrade-team-admin.sql` remains the 003-005 bundle; it does not include V2. Migration 006 is transactional and is not a repeatable seed script.
3. Configure the environment variables in `.env.v2.example` in the server deployment settings. Keep secrets out of Git, browser code and chat. `NEXT_PUBLIC_*` variables require a rebuild. Set `APP_URL` to the canonical HTTPS origin.
4. Use Bachs sandbox keys first. In the Bachs dashboard create a webhook pointing to `https://YOUR-COUNTIVA-HOST/api/billing/webhook`. Subscribe to `checkout.completed`, `collection.succeeded` and `refund.paid`. Copy its signing secret to the server. Optionally pin its organization with `BACHS_ACCOUNT_ID`. A dedicated Countiva webhook avoids retrying unrelated merchant checkouts. Checkout prices are sent directly; separate Bachs catalogue product IDs are unnecessary.
5. Deploy, then confirm all five sandbox offers create correctly priced checkouts. Complete sandbox payments, verify billing history and current/queued access. Replay a signed webhook; access must not extend twice. A browser return alone must not grant access. Reversing a fully refunded payment revokes its access/report. Partial refunds and disputes require merchant review; inspect the Bachs dashboard and resolve future-term gaps manually after reversing a queued term.
6. Generate one VAPID key pair with `npx web-push generate-vapid-keys`. Save its public/private values and contact subject in deployment settings. Keep this pair stable; rotating it requires browsers to register again. These commands generate credentials: do not paste their output into chat.
7. Configure a scheduler to GET `/api/notifications/dispatch` every five minutes with `Authorization: Bearer YOUR_CRON_SECRET`. `docs/vercel-cron.example.json` is an optional Vercel configuration example; frequent Vercel cron schedules require a suitable plan. Alternatively use an existing authenticated scheduler. No paid scheduler is enabled by this repository change.
8. On a real HTTPS installation enable reminders using a user gesture. Test morning delivery, no-update evening delivery, permission denial, browser restart, opt-out, and expired device subscriptions. On iOS, use an installed Home Screen app where Web Push is supported. Delivery depends on device/browser support and connectivity.
9. Verify device caching by opening the workspace online, waiting for the offline-ready status, then testing a sale offline and reconnecting. Cached subscription permissions are valid for at most 24 hours and never beyond the known paid expiry. The server checks access again when records sync. Device-clock changes cannot activate server entitlements.
10. Switch Bachs to live credentials and its live webhook secret only after sandbox verification. Monitor webhook failures, pending checkouts, cron delivery failures and AI timeouts. Keep standard Supabase backups and the hosting error monitor enabled.

## Import and reporting behavior

CSV/TSV and XLS/XLSX imports accept up to 1,000 data rows, 30 columns and 5 MB per file. Workbooks are parsed in a bounded worker and formula cells are rejected. Users map columns, edit preview rows and confirm before the atomic local save. Inventory uses a delivery reference to prevent repeat receiving; use a new reference for each real delivery. Historical sales have unique references and offset movements so current stock is unchanged. Import inventory first, then sales, then repayments. Export sales and repayments separately; original sale payments remain unchanged. Check ambiguous product names/units before import.

Photo suggestions require an online owner/manager, a business subscription and quota. Failed recognition releases the reservation server-side. Users review existing matches or supply name/unit/cost/price for new products. Confirmation is atomic and ticket-idempotent; no guessed prices are saved.

Basic insights use saved device records. AI daily briefs and purchased report snapshots use authoritative online records, Lagos calendar dates and aggregate data, excluding customer names. Sales and cash collections are separate. Estimated gross profit uses historical recorded costs and excludes expenses/tax. Paid reports save one immutable snapshot; an unavailable AI provider falls back to the numerical breakdown. Daily AI failures can be retried after 15 minutes; failed report preparation can be retried after five minutes without buying another credit.

Notifications are private to each user/business, at most five browsers each. Morning reminders are personalized. Evening reminders depend on online business updates, so an unsynced offline update may still trigger one. The dispatcher claims due work in bounded batches with delivery deduplication; inspect its counters and increase scheduler frequency/capacity as usage grows. Push providers may still duplicate a notification around a network failure; stable notification tags replace the visible card.

## Verification

Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`. Automated tests use an isolated PostgreSQL-compatible database, not live customer data. They cover tenancy, paid activation/idempotency, team caps, receipt restrictions, scan limits and atomic confirmation, paid reports/refunds, reminder claiming/privacy, CSV/XLSX validation, import replay, stock preservation, analytics math, and webhook signature/amount validation. A passing local build does not replace live Bachs/Supabase/browser-push verification.

Provider references: https://docs.bachs.io/guides/checkout/checkout-sessions, https://docs.bachs.io/guides/payments/payment-method-support, https://docs.bachs.io/guides/webhooks/overview, https://vercel.com/docs/cron-jobs/usage-and-pricing.
