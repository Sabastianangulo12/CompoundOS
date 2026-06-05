# Native Mobile Release Runbook

## Current State

The member app is configured for EAS/dev-client and production builds, but native release proof still depends on Apple-side credentials and App Store Connect access.

## Required Preconditions

- Expo account linked
- EAS project linked
- Apple Developer team access
- App Store Connect access
- valid signing credentials

## Build Steps

```bash
cd member-app
npx eas-cli whoami
npm run eas:build:development:ios
npm run eas:build:preview:ios
npm run eas:build:production:ios
```

## Release Gate

Do not mark native mobile fully proven until:

1. development build installs on a device
2. login works
3. member bootstrap works
4. billing summary works
5. wallet flow works
6. push registration works
7. release build completes in EAS/App Store Connect

## Honest Limitation

Without working Apple credentials in the build environment, native release hardening can be prepared but not fully proven end to end.
