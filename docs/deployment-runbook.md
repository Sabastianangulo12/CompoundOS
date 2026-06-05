# Deployment Runbook

## Pre-Deploy

1. `npm run lint`
2. `npm run typecheck`
3. `npm run build`
4. `npm run verify:ops -- http://localhost:3100`
5. `npm run verify:premium -- http://localhost:3100 http://localhost:19007`
6. `npm run stress:ops -- http://localhost:3100 6`
7. `npm run stress:multitenant -- 4`
8. `npm run chaos:payments -- http://localhost:3100`

## Database Change Flow

1. add migration
2. run `npm run supabase:push`
3. rerun readiness
4. rerun premium validator

## Post-Deploy

1. check `/api/ops/health`
2. check `/api/ops/readiness`
3. confirm dashboard load
4. confirm member web load
5. confirm billing summary
6. confirm wallet confirm
7. confirm Stripe webhooks process normally

## Rollback Triggers

- readiness fails
- payment/webhook chaos suite fails after deployment
- severe operator-facing billing/front-desk breakage
- broken member login/bootstrap path
