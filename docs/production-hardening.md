# Production Hardening

This phase is about turning the gym OS from a strong product into a system operators can trust under real business pressure.

## Scope

- observability and alerting
- health and readiness
- retry and idempotency review
- multi-tenant stress coverage
- payment and webhook chaos testing
- deployment and recovery runbooks
- native mobile release path readiness

## Current Hardening Assets

- health endpoint: `/api/ops/health`
- readiness endpoint: `/api/ops/readiness`
- premium validator: `npm run verify:premium -- http://localhost:3100 http://localhost:19007`
- ops health check: `npm run verify:ops -- http://localhost:3100`
- single-tenant operational stress: `npm run stress:ops -- http://localhost:3100 6`
- multi-tenant stress: `npm run stress:multitenant -- 4`
- Stripe/payment chaos suite: `npm run chaos:payments -- http://localhost:3100`
- full production-hardening suite: `npm run verify:production-hardening -- http://localhost:3100 http://localhost:19007`

## Release Gate

Do not treat the system as production-ready unless all of these are true:

1. `npm run lint` passes
2. `npm run typecheck` passes
3. `npm run build` passes
4. `npm run verify:ops -- http://localhost:3100` passes
5. `npm run verify:premium -- http://localhost:3100 http://localhost:19007` passes
6. `npm run stress:ops -- http://localhost:3100 6` passes
7. `npm run stress:multitenant -- 4` passes
8. `npm run chaos:payments -- http://localhost:3100` passes

## Remaining Truth

The mobile native release path still depends on working Apple Developer / App Store Connect credentials. The codebase can be hardened here, but native distribution cannot be fully proven until Apple-side access is operational.
