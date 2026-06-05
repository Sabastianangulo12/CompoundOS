# Backup And Recovery Playbook

## Backup Targets

- Supabase Postgres data
- Supabase auth users
- storage buckets if introduced later
- Stripe account configuration and webhook settings
- environment variables

## Baseline Backup Policy

- daily database backups
- pre-release snapshot before schema changes
- pre-release snapshot before major billing changes
- keep rollback notes for every migration push

## Recovery Drill

1. confirm blast radius
2. stop writes if data corruption is active
3. capture current logs and failing request ids
4. identify last known good backup
5. restore into a staging recovery project first
6. validate:
   - members
   - subscriptions
   - payments
   - notifications
   - fridge orders
7. only then restore or patch production

## Payment Recovery

If Stripe state and local state diverge:

1. keep Stripe as source of truth for subscription and invoice state
2. replay webhook chaos/sync validation
3. rerun checkout/invoice sync paths
4. validate there is one local payment row per Stripe invoice id

## Recovery Exit Criteria

- readiness endpoint green
- premium validator passes
- chaos suite passes
- operator billing/front-desk smoke passes
