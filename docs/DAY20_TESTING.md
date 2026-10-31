# Day 20 local billing and cron verification

The development checkout route uses Lemon Squeezy test mode only when
`LEMON_SQUEEZY_TEST_MODE=true` and `NODE_ENV=development`. The checkout utility
rejects a response unless Lemon Squeezy confirms `test_mode: true`. Production
always creates its normal checkout, regardless of the development toggle.

Run the local checks with:

```powershell
npm run dev:verify-checkout
npm run dev:simulate-webhooks
npm run dev:verify-cron
npm run dev:verify-email
```

The checkout check creates a real Lemon Squeezy test-mode checkout session for
a synthetic owner. It does not submit a payment or activate a subscription.
The webhook helper signs created, cancelled, and updated events, exercises the
real webhook handler and Pro check, then runs one weekly job and renders one
301 digest. Its database and delivery stay in memory; it cannot change hosted
subscriptions or email a customer.

The cron check authenticates a manual `drain` action and reads the count of
currently eligible Pro subscription rows. On 1 November 2026 there were zero
eligible Pro rows, so the drain returned `idle` and processed zero jobs. It
does not start an out-of-schedule weekly run. The Resend check sent a rendered
test digest to Resend's `delivered@resend.dev` test address and read back a
`delivered` event. No Pro user's inbox was used.

To verify the full hosted flow after Vercel deployment, finish the production
Lemon Squeezy webhook and weekly scheduler setup, complete a test checkout for
a Clerk test account, confirm its subscription row grants Pro, run a scan for
an owned domain with a newly confirmed 404, and check the digest row and the
recipient inbox. A verified custom Resend sender domain is required for Pro
user delivery. Keep test-mode billing separate from real subscriptions.
