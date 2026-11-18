# Transaction pricing, receipt exports and business push notifications

Implemented on 18 November 2026 after the product-requirements audit. This release extends the existing application and retains historical financial records.

## What changed

- Sale entry has labelled agreed-unit-price and discount inputs. The original product price is snapshotted on the transaction; its catalogue price stays unchanged. Paid amount is compared with the agreed total, so a negotiated reduction is not customer debt. A full discount is supported; amounts cannot be negative or exceed the supported integer-kobo range.
- Sales can record an optional agreed payment due date. The server validates dates and transaction amounts, derives discounts from item snapshots, records the authenticated sale recorder and preserves existing sales during offline replay. Old records without an original-price snapshot retain unknown discount history rather than an invented zero-price adjustment.
- Receipts show original/discount/agreed item amounts when adjusted, agreed total, amount paid, balance, payment status and a due date for an unpaid balance. Description, IMEI/serial details, business branding and print remain available.
- PDF downloads offer the selected 58/80 mm receipt size or centred A4 pages with 15 mm vertical margins. Long receipts paginate. Filenames include the saved business name, receipt reference and Lagos transaction date.
- Mobile retains Collected Today and Customer Credit side by side, with Discounts Given Today spanning the row underneath. The expandable breakdown has daily/7-day/30-day periods, products and sale recorders. Desktop and Business insights have the same breakdown. Financial reports and sales exports include discounts separately from revenue, collections and credit.
- Notification preferences independently control low stock, overdue debt, daily reports, weekly reports and monthly reports, alongside existing morning/evening reminders. Existing settings remain unchanged; new categories start disabled.
- Low-stock episodes are captured as inventory changes, not merely sampled by cron. Replenishment above the threshold rearms the alert. Delivery checks the current episode and quantity, so stale stock alerts are skipped.
- Overdue alerts require a real payment due date before today and a remaining unpaid balance. They show customer, current balance and due date. One event is created per sale/due date; paid balances are skipped before sending. Legacy debt with no recorded due date is not labelled overdue.
- Daily reports cover the previous completed Lagos day; weekly reports the previous Monday–Sunday; monthly reports the previous calendar month, including its actual number of days. They are saved before a report-ready event is queued. Report links open the correct accessible business and saved snapshot.
- Delivery uses the existing VAPID Web Push infrastructure. Successful devices are recorded separately so retries skip them; invalid 404/410 subscriptions are removed. Transient failures retry after five minutes, up to five attempts, while events remain eligible for 72 hours. As with standard Web Push, an acknowledgement lost after sending can cause an at-least-once retry; notification tags group the same event.

## Supabase installation

1. Confirm the intended production Supabase project. Run the read-only `supabase/check-installed-migrations.sql` diagnostic; it now lists 001–014.
2. Apply `012_included_analytics.sql` only if it is not already installed. Then run `013_transaction_prices.sql`, followed by `014_business_push_events.sql`, once each, in SQL Editor. Do not rerun prior applied migrations.
3. Run the diagnostic again. Structural checks do not replace functional tests or verify hosting secrets.
4. Deploy the tested application branch after the database upgrade. The application depends on the new RPCs; code deployment alone cannot enable them.

Migration 013 deliberately stops if the foundation sale-item insert differs from the expected implementation, rather than guessing how to modify a custom function. It adds an explicit column list before extending the item table. Neither migration silently rewrites old prices, sale totals, payments or debt.

## Enable the live notification dispatcher

Use one scheduler. The dispatcher is `GET https://www.countiva.shop/api/notifications/dispatch` with `Authorization: Bearer <CRON_SECRET>`.

1. In hosting environment variables, configure `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and a long random `CRON_SECRET`. Reuse an existing matching VAPID key pair so existing registrations keep working. Do not put private keys or the service-role key in browser variables.
2. The included `.github/workflows/countiva-notifications.yml` can call the endpoint every five minutes. Add a GitHub repository Actions secret named `CRON_SECRET` matching the hosting value. The workflow must be on the repository's default branch for scheduled runs; publishing it on the feature branch alone does not activate the schedule. After it is installed there, use **Actions → Countiva notification dispatch → Run workflow** for an initial check.
3. GitHub schedules can be delayed and do not guarantee exact-time delivery. Alternatively, use an existing scheduler which sends the same authenticated request every five minutes. `docs/vercel-cron.example.json` remains an example, not a live configuration. Check the hosting plan's scheduling support before selecting it. Avoid enabling two schedulers unnecessarily.
4. In Countiva, open Notifications, enable the desired categories, choose report time, save preferences, then connect each device. A saved preference is not proof of device registration or successful push delivery.

The workflow uses existing infrastructure and no new notification provider. GitHub account usage limits still apply. See [GitHub scheduling requirements](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Device acceptance

Android requires a supported browser and notification permission. On iOS/iPadOS, Web Push requires a supported Home Screen web app and permission requested from a user action; see [WebKit's platform requirements](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Focus settings, revoked permissions and operating-system restrictions can affect delivery. Do not promise identical background behaviour on every device.

After deployment and scheduler setup, use a labelled test business to verify:

1. Cost NGN 600,000, default NGN 700,000, agreed NGN 690,000 and paid NGN 690,000: gross profit NGN 90,000, discount NGN 10,000 and debt zero.
2. Same prices, paid NGN 600,000: debt NGN 90,000. A full-price NGN 700,000 payment gives gross profit NGN 100,000 and no discount.
3. Download and open short and long thermal/A4 receipts. Check branding, complete item details, totals and margins.
4. Connect supported Android and installed iOS devices. With Countiva backgrounded/closed, lower stock to its threshold, confirm one alert, repeat below threshold without duplicate, replenish above it, then sell down again and confirm the next episode.
5. Import a clearly labelled test credit sale with a past due date on/after the sale date, or use a new credit sale when its agreed due date passes. Confirm the overdue alert includes the genuine balance and stops after repayment.
6. Enable report categories, run the scheduler after the preferred time, and open daily/weekly/monthly report notifications. Confirm the saved dates and business, then turn categories off and verify no further sends.

Source implementation and isolated tests do not establish that production credentials, a hosted migration, a scheduler or a physical-device notification has been configured or observed.

## Verification completed

- All 48 automated tests pass, including the three financial acceptance scenarios, CSV/backup preservation, server validation, historical-record preservation, stock rearming, overdue-event deduplication, all three scheduled-report periods, tenant/role checks, actual SDK invocation without network access, invalid endpoint deletion, per-device retry deduplication and safe service-worker navigation.
- TypeScript and the production build pass. The repository's existing Next.js dependency security advisory remains a separate upgrade item previously reported.
- Chrome checks used isolated mocked accounts and production UI at 320, 390 and 1280 pixel widths. They recorded scenarios A/B/C, confirmed stock catalogue prices stayed unchanged, exercised the mobile discount breakdown, and saved every new notification preference with the chosen report time. No page overflow or runtime errors were observed.
- Downloaded seven PDFs through the production receipt buttons: short thermal/A4, all four templates, 58/80 mm widths and a 55-item long receipt. Long documents produced six or seven pages. Every page's physical size and image positioning were checked; A4 horizontal margins were numerically verified, and rendered first/last pages were inspected for centring, totals and clipping.
- Real customer accounts, production billing and physical-device pushes were not used in these isolated checks. The live acceptance steps above remain necessary after configuration.
