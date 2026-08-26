# Admin application instructions

`apps/admin` is a Vite React SPA built with Refine, React Router, and Ant Design.
ADR-0010 is authoritative for this framework boundary; do not add Next.js
routes or import source from another application.

Use the dependency direction `app -> pages -> widgets -> shared`. Route
registration, providers, and global composition belong in `src/app`; route
screens in `src/pages`; reusable page composition in `src/widgets`; and API,
auth, theme, i18n, and low-level UI in `src/shared`. Import only through a
lower layer's public module, and keep route components lazy-loaded.

Use `$frontend-development` for components, hooks, state, API clients, shared
UI, or layer changes. Compose visible behavior from Ant Design, the app's theme
tokens, existing screens, and runtime verification. `design/DESIGN_SYSTEM.md`
and the Admin operations board in `design/main.pen` are optional references.
Keep Refine resource labels and reusable application copy behind the English
i18n provider, and keep Light, Dark, and System preferences synchronized with
Ant Design tokens.

Admin operations require backend-enforced active membership, explicit reasons
for security-state mutations, actionable failure states, and auditable
outcomes. UI visibility is never authorization. Preserve the dedicated admin
refresh-cookie and coordination namespace. Treat permissions, user data,
exports, bulk operations, and impersonation as security-review triggers.

Run affected checks from the repository root:

```sh
pnpm dev:admin
pnpm --filter @languon/admin lint
pnpm --filter @languon/admin test
pnpm --filter @languon/admin typecheck
pnpm --filter @languon/admin build
```

For changed journeys, update `docs/user-flows/admin-user-management.md`, run its
mapped Playwright suite against disposable PostgreSQL/Redis, and use
`$browser-verification` for desktop and narrow real-browser evidence. Completion
requires no unexpected console errors or failed requests and a security review
for authorization or personal-data changes.
