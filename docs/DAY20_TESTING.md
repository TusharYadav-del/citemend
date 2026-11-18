# Billing and cron verification

Billing now uses Dodo Payments. Set `DODO_PAYMENTS_ENVIRONMENT=test_mode` with a Dodo test API key, webhook key, and the three configured product IDs before creating a test checkout. If the environment is unset, the SDK defaults to live mode. Product prices are set in Dodo: Pilot $149 one-time, Growth $99/month, and Agency $249/month.

Run the local checks with:

```powershell
npm run dev:verify-checkout
npm run dev:verify-cron
npm run dev:verify-email
```

The checkout check creates a Dodo test-mode session for a synthetic account; it does not submit a payment. Webhook signature verification, account/product binding, duplicate delivery handling, subscription lifecycle mapping, and the Migration 039 database transaction are covered by unit/integration tests. They run against a local PGlite database and mocked provider/database requests, not hosted billing state.

To verify billing after Vercel setup, apply migration 039, configure matching Dodo test-mode credentials and product IDs, register `https://YOUR_APP/api/webhooks/dodo` in Dodo, and complete a test checkout for a Clerk test account. Confirm the webhook creates the expected owner-bound subscription row and that the dashboard portal opens. Keep Dodo test and live credentials separate.

The cron check authenticates a manual `drain` action and reads currently eligible Pro subscription rows. The Resend check sends a rendered test digest to Resend's `delivered@resend.dev` test address. No customer inbox is used by the checkout verification.
