# Mobile architecture instructions

Build the mobile client with Expo and React Native. Keep screens focused on
composition; move reusable behavior into feature, entity, or shared modules as
the app grows. Isolate platform-specific implementations behind stable exports
and do not assume web behavior matches iOS or Android.

- Use React Native primitives and accessibility roles/labels.
- Handle keyboard, safe-area, loading, offline, retry, and reduced-motion states
  when relevant.
- Keep secrets out of the bundle. Only public configuration may use Expo public
  environment variables.
- Validate remote data through `@languon/contracts`.
- Prefer local component state; introduce shared state only for real cross-screen
  ownership.

```sh
pnpm dev:mobile
pnpm --filter @languon/mobile ios
pnpm --filter @languon/mobile android
pnpm --filter @languon/mobile web
pnpm --filter @languon/mobile typecheck
pnpm --filter @languon/mobile build
```

Verify behavior on every affected platform. If a native simulator or device is
unavailable, complete all safe automated checks and record the exact remaining
verification gap in `EVIDENCE.md`.
