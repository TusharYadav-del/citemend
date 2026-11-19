# Provenance log ingestion

Set `PROVENANCE_LOG_INGEST_SECRET` to a random secret with at least 32 characters in the Next.js deployment and in the trusted log adapter. The adapter posts batches to `POST /api/provenance` with:

- `x-citemend-timestamp`: Unix time in seconds, within five minutes of receipt
- `x-citemend-signature`: `sha256=` followed by the lowercase hex HMAC-SHA256 of `timestamp + "." + exact_raw_request_body`

The JSON body is `{ "domain": "shop.example", "source": "cloudflare_logpush", "events": [...] }`. Batches are limited to 100 events and 64 KiB. Supported sources are `cloudflare_logpush`, `shopify_webhook`, and `server_log`; supported event types are `crawler_fetch`, `ai_referral`, and `shopify_order`.

Example events:

```json
{
  "domain": "shop.example",
  "source": "cloudflare_logpush",
  "events": [
    { "type": "crawler_fetch", "url": "https://shop.example/products/mug", "userAgent": "GPTBot/1.0" },
    { "type": "ai_referral", "url": "https://shop.example/products/mug", "referrer": "https://chatgpt.com/", "sessionId": "opaque-session-key" },
    { "type": "shopify_order", "orderId": "opaque-order-reference", "sessionId": "opaque-session-key", "occurredAt": "2026-11-19T10:00:00Z" }
  ]
}
```

Crawler names parsed from a user-agent are labels only. A fetch is counted as verified only when the signed event came from the Cloudflare Logpush adapter and includes Cloudflare's `verifiedBot: true` field plus a valid client IP. Do not populate that field from a user-agent check. A Shopify adapter must first validate Shopify's native webhook HMAC, then sign the normalized event batch with the CiteMend ingestion secret. Shopify order references and session keys are keyed-hashed before storage; pass the same opaque session key on referral and order events to measure linked journeys. The route rejects domains associated with multiple workspace owners to avoid attributing external logs to the wrong tenant.

Saved audit observations separately store retrieved source URLs and URLs explicitly rendered in the answer. Customer-imported URL lists stay unclassified because they do not establish how the provider obtained or displayed each URL.
