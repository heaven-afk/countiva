# Countiva update — 3 November 2026

## Project analysis

The primary project is a Next.js 16 / React 19 application with Supabase authentication, business membership permissions, IndexedDB storage, offline support, and manual cloud reconciliation. The separate `COOU-project` directory is outside this app's scope. Root TypeScript checks now include the app and its tests explicitly.

The original interface scattered green colour literals across desktop, mobile, authentication and administration. Text sizes fell to 8px, two font families and seven weights competed for attention, and translucent white surfaces could not support dark mode. Searches had accessible names but relied on placeholders for their visible labels. Most other fields already had persistent labels. There was no billing provider or subscription entitlement model.

## Applied changes

- Countiva branding and a scalable mark inspired by the supplied logo; existing storage identifiers are preserved so rebranding does not detach business records.
- Soft off-white and charcoal surfaces, readable secondary text, hairline borders, and restrained semantic success/warning/error colours. The supplied UI and motion references informed the rounded cards, layered sales summary and compact navigation.
- Light, Dark and System appearance choices; System is the default and responds directly to system changes. Explicit choices persist on this browser. A small pre-paint script prevents the wrong theme flashing on reload.
- One font family, DM Sans, with 400/600 weights, system fallback, and a 12px minimum for visible text. Only the active floating navigation item expands its visible caption; every item retains an accessible name.
- Persistent search labels, scrollable product browsing, and a filterable native product list for receiving stock. Native keyboard navigation remains available.
- Decimal input guidance and formatting for money; phone formatting supports local and international entry. Money remains stored as exact integer kobo.
- Skeletons during authentication, device loading, platform checks and photo analysis. Existing save/sync status messages remain visible because they report operations, rather than unloaded page content.
- At least 44px primary controls and icon actions, paired business-detail fields on desktop, reduced-motion support, and theme-aware dialog shadows.

## Provisional subscriptions

| Plan    | Monthly | Three months |  Yearly |
| ------- | ------: | -----------: | ------: |
| Starter |  ₦1,500 |       ₦4,000 | ₦15,000 |
| Growth  |  ₦3,000 |       ₦8,000 | ₦30,000 |

The two monthly options are Starter and Growth. Both tiers also offer three-month and yearly periods. Three months saves approximately 11%; yearly saves approximately 17%, compared with paying monthly. The interface shows the entire amount per billing period.

Public pricing is available at `/plans`; signed-in businesses can find Subscription in the searchable business menu. Owners can save and clear a business-specific plan preference on the current browser. Staff and managers cannot change it. This is not an active subscription: no payments, automatic renewals, provider integration, account-synced billing state or feature restrictions have been introduced. Pricing and feature groupings are explicitly labelled as proposals.

To enable paid subscriptions, choose a billing provider and add server-verified checkout, signed webhook processing, business-scoped subscription records, and server-enforced entitlements. A browser preference must never grant paid access.

## Verification

The production build and the 17 existing domain, database, security, backup, password and storage tests passed. Input-format checks cover decimal precision and Nigerian phone grouping. Browser review covers the shared dashboard and transaction components with explicitly labelled example data, desktop/mobile navigation, menu search, sign-in/onboarding, public pricing, and light/dark appearance. No business records were created or changed during visual QA. Full authenticated cloud interaction still requires a signed-in test workspace; payment processing is intentionally unavailable.

## Monochrome design and complete branding

The desktop sidebar is replaced by a floating navigator with an expanding active pill. Mobile uses a five-item dock, with secondary pages available in a searchable business menu. Related money figures, grouped quick actions, a layered mobile sales card, consistent transaction rows, paired forms, branded skeletons and a branded missing-page screen share the same typography and spacing. The menu supports search aliases such as “stock”, “billing” and “debt”; the workspace keeps keyboard focus within open dialogs and prevents background scrolling.

The Countiva mark is charcoal on light surfaces and ivory on dark surfaces. One geometry source generates the inline interface mark, adaptive SVG favicon, explicit light/dark favicon variants, a real multi-size ICO, Apple touch icon, and maskable 192/512px install icons. Manual theme overrides update the browser favicon and theme colour; system-theme changes are also observed. Regenerate assets with `npm run generate:brand-assets`.

The service-worker cache version is updated and the full icon set is cached for offline use. Development removes only this app’s old shell caches and service worker to prevent stale production assets interfering with live UI changes. Business storage and account state are preserved.
