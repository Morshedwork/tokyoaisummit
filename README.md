# Tokyo AI Summit

A full-stack event website using the supplied red, black and ivory Tokyo reference, Vinext/React, Cloudflare D1, platform-managed sign-in, and Stripe Checkout.

## Features

- Responsive editorial event site with focused pages for the summit (`/about`), program (`/program`), speakers (`/speakers`), showcase (`/showcase`), partnerships (`/partners`) and passes/visit details (`/attend`).
- Poster-inspired skyline parallax, animated signal ribbons, chapter sun motifs, staggered section entrances and interactive showcase areas. Includes a persistent motion toggle and respects reduced-motion preferences.
- Speaker directory with format filters, search and biography panels. The organizer can create, edit, order, publish, unpublish or remove speaker profiles; unpublished drafts never enter the public response. Unannounced lineups display editorial placeholders, not fabricated people.
- Editable event details, eight subject areas, filterable program, partnership/speaker/exhibitor applications, FAQs and ticket announcement list.
- Persistent applications and registrations in D1.
- Organizer-only dashboard: metrics, attendee search, CSV export, ticket pricing/capacity, agenda and speaker editing, application review, QR check-in, full Stripe refunds and event settings.
- Free registration and server-priced JPY Stripe Checkout for paid passes. Each order quantity creates individual digital passes.
- Atomic inventory reservations, verified/idempotent payment fulfillment, account-scoped ticket access, duplicate check-in prevention and test-ticket rejection at entry.
- Ticket QR codes, printable passes, optional calendar download and pending checkout resume/cancellation.

- Searchable program with a browser-local saved schedule, clear timeline, expandable sessions and overlap guidance. Saving does not reserve seats.
- Refined mobile typography, larger touch targets and a persistent passes link on small screens.

## Initial state

The site starts private and ticket sales are closed. The 2026 editorial brief takes precedence over the reference poster's March 2027 date; the date and venue remain unconfirmed. Prices (Free / ¥5,000 / ¥12,000) and capacities are explicitly preview values for organizer review. No speakers, partners, payment activity or attendees are fabricated.

## Runtime configuration

Set through Sites runtime settings, never client code:

- `ADMIN_EMAILS`: comma-separated organizer email allowlist (authorization checked on the server).
- `SITE_URL`: exact canonical site origin.
- `STRIPE_SECRET_KEY`: Stripe test key, then live key after testing.
- `STRIPE_WEBHOOK_SECRET`: signing secret for this site's webhook endpoint.

Changes require deployment to apply. The owner account is configured as organizer. All other signed-in users have attendee-level access only.

Stripe endpoint: `/api/stripe/webhook`. Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`

The site must be publicly accessible before Stripe can deliver webhooks. Keep the admin allowlist restricted. The attendee redirect also verifies payment server-side; the dashboard has explicit reconciliation for missed events. Never mark an order paid based only on a URL parameter. Network-ambiguous checkout failures retain inventory until reconciliation.

## Before ticket sales

1. Confirm the actual event date, venue, legal organizer details, final prices and refund policy in the dashboard.
2. Add Stripe test credentials, redeploy and complete an end-to-end Stripe test checkout, webhook delivery, refund and check-in scenario.
3. Confirm site sharing and webhook reachability, use live credentials, redeploy and enable registration.

Transactional ticket emails are not configured. Attendees retrieve and print their tickets in My tickets. Camera scanning uses native detection when available and a jsQR fallback otherwise; QR photo upload, manual entry and hardware scanners are supported.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit`
- `node --experimental-strip-types --test tests/rules.test.mjs`
- `python tests/inventory.py`
- `node tests/routes.test.mjs`
- `node tests/pages.test.mjs`
- Build with the Sites `build-site.mjs` helper.

Route tests use an isolated in-memory SQLite database and mock identity/environment only. They do not create production registrations or charge payments.

## Sources

- Supplied event brief and reference design.
- Stripe Checkout: https://docs.stripe.com/api/checkout/sessions/create
- Stripe fulfillment: https://docs.stripe.com/checkout/fulfillment
- Webhook signatures: https://docs.stripe.com/events/manage-webhook-endpoints
- JPY amounts: https://docs.stripe.com/currencies

## October 2026 ticketing update

- Group checkout collects an attendee name for every pass. Attendees can rename unused passes and download an individual PNG for offline entry. Organizers can correct unused pass names from order details.
- Checkout requests have a unique per-account booking key. Retries reuse the same reservation and Stripe idempotency key; ticket names and checkout prices are snapshotted at booking.
- Organizer order details include ticket codes, check-in state, receipt links and unused free-registration cancellation. Arrival corrections, data changes and refund requests are recorded in an organizer activity log.
- CSV exports cover orders, individual passes/check-ins and applications. Applications support accepted/declined review states.
- Check-in supports native QR scanning, a jsQR camera fallback (including browsers without BarcodeDetector), QR photo upload, guest search and hardware/manual code entry.
- Payments shows a real API connectivity check, a key-specific verification timestamp, signed webhook delivery history, reconciliation and explicit test/live status. Key presence is not displayed as verified connectivity.
- Refunds suspend passes immediately, preserve allocated capacity while pending, invalidate passes on success and restore them on confirmed failure. Replayed or late payment events cannot revive refunded orders. Unknown provider outcomes require reconciliation.
- Live payment receipt emails are requested from Stripe; separate ticket emails are not configured. Tickets remain available in the buyer account and as downloads.

Additional webhook subscriptions: `checkout.session.async_payment_failed`, `refund.updated`, `refund.failed`.

The payment lifecycle tests use the actual Stripe SDK with simulated HTTP responses. They cover amount tampering, duplicate bookings/webhooks/refunds, late events after refund, receipts and owner isolation. These checks do not replace a real Stripe test-mode checkout, webhook delivery, refund and device-camera test after the account is connected. Browser QA was unavailable in the authoring environment for this update.
