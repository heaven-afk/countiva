# Subscription administration, installation and editable receipts

Apply migrations 007 and 008 after 001–006, then deploy this application version. Do not expose the new controls against an older schema. Both migrations are transactional and should run once through the Supabase migration pipeline or SQL editor. Rehearse against staging and retain normal database backups.

## Admin dashboard

Open /admin with an existing confirmed platform owner/admin account. Ordinary business owners do not receive platform permissions. Owners and admins can search all businesses, filter status, inspect current access/expiry/team use, view verified subscription payments, and review access/billing history. Platform viewers can inspect but cannot change access.

Manage actions:

- Pause access: blocks new stock, sales, scan confirmation, invitations, AI daily briefs, purchases and reminder delivery. Reads, exports and existing paid reports remain available. Expiry clocks continue; a pause does not freeze or extend paid/trial periods.
- Resume current access: removes an admin pause if the underlying access is still valid. Expired businesses need a new activation or trial.
- Free Growth trial: zero charge with Growth's normal subscription features (owner plus five users, four receipt templates, 100 scans per calendar month and 40 products per photo). The form defaults to 14 days and permits a chosen expiry up to one year away. Detailed NGN 5,000 report snapshots remain a separate purchase.
- Manual activation: grants Starter or Growth access until the selected expiry. It does not charge a customer, verify an external payment or change a Bachs order to paid. Include external payment references in the required administrator reason where appropriate.
- End trial/manual activation: revokes only the current administrator grant. Verified paid terms remain unchanged, including any scheduled future start. A separate pause remains in force.

New trials/activations replace earlier administrator grants and remove legacy migration access; current verified paid terms remain intact. An unexpired administrator grant takes priority for features, then the valid paid term resumes when the grant ends. Purchases during a trial/grant queue after its expiry or the end of existing paid access, whichever is later. Ending a grant early does not pull a scheduled paid period forward. Monthly scan use does not reset on a new trial. Pending Starter downgrades retain the three-seat invitation cap.

Each administrator action stores the actor, reason, previous/next access and a request reference. Duplicate delivery of the same request cannot grant a second access period. Bachs payment history stays separate from free access. Existing team members are never silently removed; review team size before granting Starter.

Migrations add no new credentials. Existing Supabase configuration is used for authenticated admin RPCs; existing service credentials, Bachs verification and scheduler settings remain necessary for their corresponding services.

## Installation and notifications

The workspace shows a dismissible install card (a dismissal lasts seven days), and Notifications always offers install guidance when Countiva is not running as an installed app. Chromium's native install prompt is used only when available and after a click. Other browsers receive manual instructions. Installation is never reported as complete merely because instructions were displayed.

On iPhone/iPad, add Countiva through Safari's Share menu → Add to Home Screen, leave Open as Web App enabled if shown, then open its Home Screen icon. Web Push requires a Home Screen web app on iOS/iPadOS 16.4 or newer and an explicit user permission action. An ordinary iOS browser tab is insufficient. Supported desktop/Android browsers can receive push without installing. Installed app launches open /workspace; the existing app identity remains / to avoid creating a second identity.

The notification button now has its own centred 44px touch target, aligned beside the profile control, with active and keyboard-focus styles. It does not display an invented unread count.

VAPID keys and the authenticated reminder scheduler from the V2 release guide still need to be configured. Migration 007 makes the reminder dispatcher include active free trials and exclude paused/expired businesses. Real device delivery still depends on permission, browser support and connectivity.

Primary references:

- https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers
- https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios

## Receipt editing

Open a receipt from a sale or sales history and choose Edit receipt details. After the sale is saved online, the business owner, a manager or that sale's original recorder can save:

- Receipt customer name and phone.
- Optional order/job reference.
- Overall receipt description/note.
- An optional description for each item.
- IMEI numbers (15 digits each) or serial numbers for individual receipt items, one per line, up to 100 identifiers per item.

These are receipt fields only, as requested; there is no individual-unit inventory assignment or tracking. The original receipt identity, financial customer/credit record, quantities, prices, payments and totals remain intact. All four templates print the additional fields and the receipt's revision. Connect online to save corrections; completed receipt corrections are not queued as offline edits. Print/save PDF becomes available after saving or cancelling the editor.

Receipt changes have an audit history and optimistic revision checks. Reloading a receipt discards unsaved field changes; a conflicting save keeps the draft and asks the user to reload. Old workspace sync snapshots cannot overwrite newer receipt fields. New/restored sale uploads can include validated receipt details; their local revision numbers are not trusted as server history. JSON backups retain identifiers and descriptions. Existing server audit history remains in Supabase; restoring a new sale starts its receipt history at revision zero. CSV financial exports keep their existing format; print/PDF and backups contain the new receipt fields.

## Verification

Run npm test, npm run typecheck and npm run build. Tests cover platform owner/admin/viewer/unconfirmed roles, trial Growth limits, pause and resume, expiry, verified payment integrity, trial-to-paid scheduling, receipt permissions/validation/revisions, financial/stock preservation, stale sync protection and backup round trips. Test native installation and notification delivery on real HTTPS iOS/Android/desktop devices after configuring the deployment; automated database checks do not impersonate browser permission flows or make live payments.
