# The Compound Lifting Club OS

Multi-tenant gym management SaaS built with Next.js, TypeScript, Tailwind, Supabase, Stripe, and an Expo member app.

## Stack

- Web app: Next.js App Router + TypeScript + Tailwind CSS
- Backend/data: Supabase Auth + Postgres + RLS
- Mobile app: Expo + React Native + TypeScript
- Billing: Stripe Connect + Stripe Checkout + webhooks

## Workspaces

- Web app: `./`
- Member app: `./member-app`
- SQL migrations: `./supabase/migrations`

## Required Environment Variables

### Web app (`.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
EXPO_PUSH_ACCESS_TOKEN=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Member app (`member-app/.env`)

```bash
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_EXPO_PROJECT_ID=
```

## Setup Guide

1. Install dependencies.

```bash
npm install
```

```bash
cd member-app
npm install
```

2. Create the web and mobile env files from the examples.

3. Create a Supabase project.

4. Run the SQL migrations in order.

## Migration Order

Apply these in filename order:

1. `202605120001_create_profiles.sql`
2. `202605120002_create_gyms_and_gym_users.sql`
3. `202605120003_create_members.sql`
4. `202605120004_create_check_ins.sql`
5. `202605120005_create_member_scores_and_ai_insights.sql`
6. `202605120006_create_revenue_engine.sql`
7. `202605120007_create_automations.sql`
8. `202605120008_enable_member_mobile_access.sql`
9. `202605120009_add_qr_check_in_method.sql`
10. `202605120010_link_members_to_auth_users.sql`
11. `202605120011_create_workouts.sql`
12. `202605120012_create_notifications.sql`
13. `202605120013_create_community_system.sql`
14. `202605120014_enhance_community_engagement.sql`
15. `202605120015_add_stripe_billing.sql`
16. `202605120016_hardening_and_idempotency.sql`

## Local Development

### Web app

```bash
npm run dev
```

Open `http://localhost:3000`.

### Member app

```bash
cd member-app
npm run start
```

Use Expo Go or a simulator.

## Stripe Local Setup

1. Create a Stripe account.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
3. Set `NEXT_PUBLIC_APP_URL` to your local web app URL.
4. Forward Stripe webhooks to:

```bash
/api/stripe/webhooks
```

Recommended Stripe events:

- `customer.subscription.created`
- `customer.subscription.updated`
- `invoice.paid`
- `invoice.payment_failed`

## Beta Checklist

- Supabase env vars are present for web and mobile.
- Service role key is configured for webhooks/admin sync paths.
- All migrations are applied in order.
- At least one gym owner account can sign up, onboard, and reach `/dashboard`.
- Stripe Connect onboarding completes for a gym.
- A member can complete Stripe Checkout for a plan.
- Stripe webhooks reach the local server and mark events processed.
- A failed payment creates:
  - a `payments` row with `failed`
  - a `subscriptions` row/status sync
  - a `failed_payment` AI insight
  - a billing notification record
- Expo push registration works on a physical device.
- Member app can log in and load member context by `user_id`.

## Stability Notes

- Dashboard routes are protected in both middleware and server layout.
- Stripe webhooks are idempotent through `stripe_webhook_events`.
- Duplicate live subscriptions are blocked with a partial unique index.
- Duplicate Stripe invoice/payment-intent records are protected with unique indexes.
- Community, workout, notification, and billing flows are gym-scoped by design.

## Useful Commands

### Web

```bash
npm run dev
npm run lint
npm run typecheck
```

### Mobile

```bash
cd member-app
npm run start
npm run typecheck
```

## Known Assumptions

- Stripe billing is USD-only in this version.
- Stripe Checkout is started from the dashboard for a selected member and plan.
- Webhook sync is required for Stripe subscription/payment truth to land in Supabase.
- Expo push delivery requires valid Expo/FCM project configuration outside this repo.
