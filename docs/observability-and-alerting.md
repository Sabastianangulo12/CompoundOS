# Observability And Alerting

## Endpoints

- liveness: `/api/ops/health`
- readiness: `/api/ops/readiness`

## What Readiness Covers

- required environment variables exist
- Supabase admin queries succeed
- Stripe API access succeeds

## Structured Operational Logging

Critical paths now emit structured JSON logs for:

- Stripe webhooks
- member billing sync
- fridge purchase confirmation
- notification creation and delivery
- automation runner failures

## Alert Conditions

Alert immediately when any of these happen repeatedly:

- `/api/ops/readiness` returns `503`
- Stripe webhook verification failures spike
- Stripe webhook processing failures spike
- billing sync failures spike
- fridge confirm failures spike
- notification send failures spike
- Expo push token lookup failures spike

## Minimum Monitoring Setup

At deployment time, wire logs and endpoint checks into:

- uptime monitor hitting `/api/ops/health`
- readiness monitor hitting `/api/ops/readiness`
- error aggregation for JSON logs
- alert fanout to Slack/email/pager for repeated failures

## Daily Operator Checks

1. readiness endpoint green
2. Stripe webhook traffic healthy
3. no sustained failed payment spike
4. no rising notification failure rate
5. no unusual front-desk confirm failures
