# Countiva three-package release

| Package  |    Monthly | Annual (12 months) | Team            | Scans/month | Products/photo | Receipts    | Business insights                |
| -------- | ---------: | -----------------: | --------------- | ----------: | -------------: | ----------- | -------------------------------- |
| Starter  |  NGN 5,000 |         NGN 50,000 | Owner only      |          10 |             10 | 2 templates | Not included; upgrade message    |
| Growth   | NGN 15,000 |        NGN 150,000 | Owner + 2 staff |          30 |             20 | 4 templates | Standard summaries and reports   |
| Business | NGN 30,000 |        NGN 300,000 | Owner + 5 staff |         100 |             40 | 4 templates | Full analysis and 90-day reports |

All packages include stock, sales, credit, branded editable receipts and CSV/Excel import/export. Annual prices equal ten monthly payments (16.7% less than twelve). No separate analytics purchase. New owners retain the 30-day free Growth trial and eight-character password minimum.

Growth reports show sales, gross profit, collections, customer balances and daily totals, with a concise explanation and two suggested steps. Select 1, 7 or 30 days; scheduled calendar-month reports may span 31 days. Business adds every product's recorded margin and stock cover, idle inventory, customer balance age, payment mix, period comparison, prioritised actions and the 90-day view. AI availability depends on the provider; calculated reports remain available without it. Collections are not a verified available-cash balance and gross profit excludes expenses and tax.

Starter is blocked from insights and reports in the page, API, report RPCs and scheduled-report creation. Normal sales totals and operational stock information remain available. Growth responses omit the detailed Business fields on both fresh and cached reports. Historical Growth contracts keep their previously granted detailed analysis until their granted term expires.

## Deployment

1. Run the read-only supabase/check-installed-migrations.sql against the actual production project. It reports 001–019. Do not blindly rerun PRESENT or PARTIAL migrations.
2. Apply only missing migrations in filename order. If platform_trial_settings is missing, 015 must be installed before 017. Apply 016, then 017 if missing, then **018_three_package_pricing.sql**, then **019_analytics_packages.sql**. An 018/019 dependency error means prerequisites have not been applied in that project.
3. Deploy the code. The live checkout prices come from the database, not just the price cards. Check the six enabled offers in admin pricing. Retired 3- and 6-month codes remain for historical references but are disabled for new purchases. Admins can still edit prices and availability; the public page and checkout use those values.
4. Existing orders keep their amounts and capacity snapshots; existing trials and paid periods keep their expiry dates. A pending checkout is not repriced. New owner-only Starter purchases are refused when the business still has staff or pending invitations. Future lower-capacity purchases constrain new invitations so the eventual switch remains valid. No payment is charged by these migrations.
5. Check real Bachs test/live merchant readiness before accepting payments. No merchant credential or production database was changed from this workspace.

## Installed application and receipts

The app checks its deployed version on launch, foreground return, reconnection and hourly while visible. Navigation fetches fresh HTML online and the worker script bypasses browser caching. Existing offline data is retained. An open session shows Refresh app when a newer deployment is detected; finish the current entry first. A fresh online launch loads the current app without removing its Home Screen installation. Offline devices get updates after reconnecting.

Home Screen Print receipt prepares the same branded PDF used by Download PDF, then offers a separate tap to open the native file share sheet. Choose Print there, or save/open the PDF in Files or a PDF viewer and print from its menu. Share-sheet print availability depends on OS/device; web code cannot force an unsupported native print dialog. Browser mode retains normal printing. Changing paper size or editing the receipt clears a prepared print file.

The Stock type label and (e.g carton, pack, crate) hint replace Stock unit. Stored unit fields remain compatible; imports recognise both Stock unit and Stock type headers.

## Domains and verification

On 20 November 2026, a live request to https://countiva.shop/plans returned 308 to https://www.countiva.shop/plans and the www page returned 200. Keep www as the canonical host. Do not add a reverse www-to-apex redirect or it will loop. Vercel owns this redirect and both hostnames must remain configured there; this release does not change DNS or certificates. Follow Vercel's domain settings if reconfiguring: https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting.

Version checks follow the service-worker lifecycle and explicit update checks: https://web.dev/articles/service-worker-lifecycle. No forced reload interrupts an active form.

Automated checks cover the migration chain, pricing, seats, insight restrictions/projections, verified Business payment and preservation of historical terms. Mocked Chrome checks cover Starter's locked state, Growth summaries, Business breakdowns, monthly/annual cards and widths 320/390/1280, plus generated PDF sharing and download. A physical iOS print-sheet check remains necessary. Production Auth settings, DNS, database and payment accounts require their own live acceptance checks.
