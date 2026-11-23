# Manual payments, Countiva Admin and Starter Hot Deal

## Deploy

1. Confirm migrations 001–021 are present using `supabase/check-installed-migrations.sql`. Do not rerun installed migrations.
2. Apply **022_manual_payments_and_admin_alerts.sql** once in the same Supabase project used by production.
3. Apply **023_starter_hot_deal.sql** once. Applying this migration starts the seven-day offer. It does not change the normal Starter catalogue price or reset existing subscriptions/trials.
4. Deploy the application and refresh any already-open app. No reinstall is required for application updates.
5. Sign in at `https://www.countiva.shop/admin/login`. Only accounts authorised in `platform_admins` can enter. Business ownership alone grants no platform permissions.

Migration 023 creates Starter monthly at ₦2,000 for seven days, using a separate promotion record. The standard price remains ₦5,000 unless an administrator changes it. Annual, Growth and Business prices are unaffected. All owners can purchase Starter during the window, including renewals, subject to its owner-only capacity. Each purchase buys one month; it does not create an automatic debit. After the window, new purchases use the normal price automatically. Paid purchases retain their price and access period. Admin price editors continue to edit normal prices.

## Payment flow

- In the business Subscription screen, owners select bank transfer and a plan. The server snapshots price, capacity, receiving account and quote expiry before any transfer is made.
- Receiving bank: **Alat by Wema**. Account name: **Zion Akachukwu Ogadi**. Account number: **0272178094**. The account details are seeded in the private `manual_billing_settings` table and displayed only after an authorised owner requests instructions. These details are intentionally customer-facing; no banking credentials are stored.
- Owners confirm payment and enter the sender name and transaction reference. Submission creates a private admin alert. It never activates access on its own.
- Admin → Transfers shows the review queue with pagination and filters. The administrator verifies the actual bank credit, enters its reference and exact amount, checks the confirmation box and supplies a customer-visible note.
- Approval records a paid billing order and a subscription term after the latest existing paid/granted period. Administrative pauses remain in force. Team capacity is rechecked at approval. Any conflict must be resolved before approving.
- Each bank reference can be used only once, including after business deletion. Repeated approval of the same completed request is idempotent. Database permissions deny owner, staff, viewer and anonymous attempts to approve payments or write financial tables directly.
- A promotional bank transfer needs the actual bank credit date/time in **Lagos time**. The bank credit must fall inside the quoted promotion window even when reviewed later. Late or unmatched payments need a customer resolution; rejection does not refund money.
- Customers can refresh their transfer requests to see review notes and approvals; the visible panel polls every 30 seconds. Submitted claims block business deletion until reviewed. Cancel is available only for instructions that have not been submitted.
- Bank transfers are manually renewed. Existing Bachs checkout and webhook verification remain available separately.

## Install the admin app

Open `/admin` or `/admin/login`, then install using the browser menu. On iPhone, use Safari → Share → Add to Home Screen. The admin manifest has a distinct application ID, `/admin` scope, start page, and Countiva icon with **ADMIN** underneath. It can be installed alongside the normal business app. Both use the same Countiva account service and browser-origin session; installation is not an authorisation boundary.

Desktop navigation uses a sidebar; mobile uses a bottom navigator with a More menu. Admin pages are online-only and are excluded from service-worker navigation caching. Dashboard sections mount on demand instead of all appearing on one long page.

## Admin notifications

- The inbox exists without Web Push configuration. Transfer submissions create durable alerts; the dashboard refreshes its inbox every 30 seconds while visible.
- Activity alerts compare a rolling 24 hours with the prior seven-day daily average. Thresholds are 3× the average plus minimum counts: **20 public page views, 5 new businesses, or 50 stock scan requests**. Each metric alerts once per Lagos calendar day. These are observed activity signals, not unique visitors, server-health measurements or fraud diagnoses.
- The inbox retains a rolling 30-day view and per-admin read state. Preferences control push categories, not deletion of the shared inbox history.
- Enable push in Admin → Alerts, save, and connect the device. iPhone push requires opening the installed Home Screen app on a supported iOS version and granting permission.
- Production needs the existing matching `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`. Keep private keys server-side. Redeploy after changing environment variables.
- The existing authenticated `GET /api/notifications/dispatch` now claims admin alerts as well as business reminders. Configure the existing scheduler as described in `TRANSACTIONS-AND-PUSH-RELEASE.md`; feature-branch workflow changes alone do not activate a default-branch GitHub schedule.
- Delivery checks current platform permission and user preferences, retries transient failures with a five-minute lease, and removes expired endpoints. Admin push opens `/admin#payments` or `/admin#alerts`. Signing out attempts to disconnect this device’s admin endpoint without removing business subscriptions. Push timing depends on the scheduler, provider and device; it is not instant or guaranteed.

## Service readiness errors

The old generic admin API error hid several distinct causes. New responses distinguish expired/unverifiable sessions (401), an incorrect APP_URL (403), missing server public Supabase variables, missing schema and connection failures. Detailed secrets and internal provider messages are not exposed. Error codes appear in Vercel function logs.

For the existing screenshot failure, deploy first, then retry Service health and Website traffic. Follow the resulting message. Check **APP_URL=https://www.countiva.shop**, ensure Vercel Production uses the same Supabase URL/anon key as the deployed browser bundle, and sign out/in after configuration changes. Do not paste keys into chat.

## Validation

Automated database tests cover owner/admin boundaries, actual-credit checks, price snapshots, duplicate bank references, queued paid access, rejection/cancellation, deletion/audit retention, spike deduplication, personal read state and revoked-admin push access. Promotion tests cover both checkout paths, unchanged normal pricing, automatic expiry and valid bank-credit dates. API and service-worker tests cover actionable errors and trusted admin notification destinations. Native iPhone installation, real bank confirmation and actual push delivery require live device/configuration verification.
