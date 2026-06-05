# Information Architecture

## Product Shape

Compound OS should behave like two connected systems:

- owner and staff operating system
- member-facing gym app

They should share the same data model, but they should not feel like the same interface.

## Dashboard Target Structure

### Primary Navigation

- Overview
- Front Desk
- Members
- Memberships and Billing
- Check-Ins
- News
- Retention
- AI Command Center
- Automations
- Reports
- Settings

### Overview

Purpose:
- daily summary for owners

Should contain:
- today's check-ins
- frozen memberships
- canceled memberships
- failed payments
- outstanding front desk actions
- gym news draft shortcuts
- at-risk members

### Front Desk

Purpose:
- live operations workspace

Should contain:
- check-in scan
- payment QR scan
- recent purchases
- frozen member alerts
- failed payment warnings
- quick member lookup
- fridge and merch product management

### Members

Purpose:
- source of truth for member management

Should contain:
- member list
- filters by status and plan
- member profile
- notes
- visits history
- billing history
- milestones
- community status

### Memberships and Billing

Purpose:
- all commercial membership controls

Should contain:
- plan management
- plan pricing
- subscription assignment
- billing cycle status
- payment methods
- freeze, renew, cancel actions
- revenue summaries

### Check-Ins

Purpose:
- attendance workflows

Should contain:
- check-in feed
- scan tools
- manual adjustments
- visit analytics

### News

Purpose:
- owner-to-member communication

Should contain:
- post composer
- pinned announcement controls
- draft and scheduled posts later

### Retention

Purpose:
- recover members before they churn

Should contain:
- low attendance
- frozen members
- upcoming cancellations
- payment failures
- re-engagement recommendations

### AI Command Center

Purpose:
- owner intelligence layer

Should contain:
- at-risk member summaries
- revenue leaks
- follow-up suggestions
- gym trend summaries

### Automations

Purpose:
- repeated action engine

Should contain:
- lifecycle triggers
- billing triggers
- attendance triggers
- staff reminders
- milestone automations

### Reports

Purpose:
- trust and visibility

Should contain:
- active membership count
- churn
- freeze rate
- attendance
- revenue by plan
- front desk sales

## Member App Target Structure

### Primary Navigation

- Home
- Training
- Community
- Wallet
- Profile

### Home

Purpose:
- daily gym companion

Should contain:
- QR payment or QR utility entry
- highlights
- steps
- visits
- PR tracking
- gym news
- challenge callouts

### Training

Purpose:
- all training-related activity in one place

Should contain:
- workouts
- coach
- progress
- training history

### Community

Purpose:
- culture and social retention

Should contain:
- friend activity
- posts
- reactions
- comments
- challenges later

### Wallet

Purpose:
- in-gym purchases and account utility

Should contain:
- payment QR
- product folders
- purchase confirmation
- receipts

### Profile

Purpose:
- member identity and account control

Should contain:
- payment information
- membership state
- billing cycle
- freeze or renew actions
- account details
- notification preferences later

## Cross-System Rules

1. Membership creation and pricing are dashboard-owned.
2. Member app can view membership state and renew when appropriate.
3. Front desk actions should create auditable events.
4. Notifications should be generated from lifecycle state, not hardcoded UI assumptions.
5. Gym-scoped data must remain enforced at every layer.

## Design Direction

### Dashboard

- dense enough to feel operational
- fast to scan
- action-first, not decoration-first
- surfaces problems early

### Member App

- premium
- clean
- iOS-native feeling
- motivational and identity-driven

## Immediate IA Priorities

1. Make Front Desk a true operator home base
2. Deepen Members into a real member detail system
3. Finish Memberships and Billing so the rest of the OS has a stable commercial layer
4. Keep Home, Training, and Wallet feeling distinct in the member app
