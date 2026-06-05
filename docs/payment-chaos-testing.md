# Payment And Webhook Chaos Testing

## Command

```bash
npm run chaos:payments -- http://localhost:3100
```

## What It Tests

- malformed Stripe signature rejected
- duplicate subscription webhook idempotency
- invoice webhook replay stability
- account update webhook processing
- no duplicate payment rows for the same Stripe invoice id

## Why It Matters

Payment systems fail at the edges:

- duplicates
- retries
- race conditions
- malformed requests
- partial upstream outages

This suite exists to prove the billing system stays sane when those happen.
