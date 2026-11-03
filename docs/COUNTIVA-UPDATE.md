# Countiva update — 3 November 2026

## Project analysis

The primary project is a Next.js 16 / React 19 application with Supabase authentication, business membership permissions, IndexedDB storage, offline support, and manual cloud reconciliation. The separate `COOU-project` directory is outside this app's scope. Root TypeScript checks now include the app and its tests explicitly.

The original interface scattered green colour literals across desktop, mobile, authentication and administration. Text sizes fell to 8px, two font families and seven weights competed for attention, and translucent white surfaces could not support dark mode. Searches had accessible names but relied on placeholders for their visible labels. Most other fields already had persistent labels. There was no billing provider or subscription entitlement model.

## Applied changes

- Countiva branding and a scalable mark inspired by the supplied logo; existing storage identifiers are preserved so rebranding does not detach business records.
- Shared blue accent with graded neutral surfaces, readable secondary text, hairline borders, and semantic success/warning/error colours. The multicolour gradient is limited to the brand mark.
- Light, Dark and System appearance choices; System is the default and responds directly to system changes. Explicit choices persist on this browser. A small pre-paint script prevents the wrong theme flashing on reload.
- One font family, DM Sans, with 400/600 weights, system fallback, and a 12px minimum for visible text. Existing zero-size rules hide icon-navigation captions at narrow widths.
- Persistent search labels, scrollable product browsing, and a filterable native product list for receiving stock. Native keyboard navigation remains available.
- Decimal input guidance and formatting for money; phone formatting supports local and international entry. Money remains stored as exact integer kobo.
- Skeletons during authentication, device loading, platform checks and photo analysis. Existing save/sync status messages remain visible because they report operations, rather than unloaded page content.
- At least 44px primary controls and icon actions, paired business-detail fields on desktop, reduced-motion support, and theme-aware dialog shadows.

## Provisional subscriptions

| Plan | Monthly | Three months | Yearly |
| --- | ---: | ---: | ---: |
| Starter | ₦1,500 | ₦4,000 | ₦15,000 |
| Growth | ₦3,000 | ₦8,000 | ₦30,000 |

The two monthly options are Starter and Growth. Both tiers also offer three-month and yearly periods. Three months saves approximately 11%; yearly saves approximately 17%, compared with paying monthly. The interface shows the entire amount per billing period.

Public pricing is available at `/plans`; signed-in businesses have a Subscription navigation item. Owners can save and clear a business-specific plan preference on the current browser. Staff and managers cannot change it. This is not an active subscription: no payments, automatic renewals, provider integration, account-synced billing state or feature restrictions have been introduced. Pricing and feature groupings are explicitly labelled as proposals.

To enable paid subscriptions, choose a billing provider and add server-verified checkout, signed webhook processing, business-scoped subscription records, and server-enforced entitlements. A browser preference must never grant paid access.

## Verification

The production build and the 17 existing domain, database, security, backup, password and storage tests passed. Input-format checks cover decimal precision and Nigerian phone grouping. Browser review covers public pricing periods and light/dark appearance. Authenticated business flows require a signed-in test workspace for full visual acceptance; payment processing is intentionally unavailable.
