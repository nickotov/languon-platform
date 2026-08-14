# Admin web architecture instructions

Follow the web application's pages-first Feature-Sliced Design and dependency
direction: `app -> pages -> widgets -> features -> entities -> shared`. Keep
Next.js route files thin and never import another slice's implementation
internals. Keep the FSD layers under `src/fsd`; Next.js reserves a top-level
`src/pages` directory for the legacy Pages Router.

Use `$frontend-development` whenever creating or restructuring components,
hooks, state, API clients, shared UI, or imports between FSD slices. Follow its
component folders, CSS Modules, native-element, and state-communication rules.

Admin operations require explicit authorization, confirmation for destructive
or bulk actions, actionable failure states, and auditable outcomes. Do not rely
on hidden UI controls for authorization; the backend must enforce every access
decision. Treat exported data and user impersonation as security-review triggers.

```sh
pnpm dev:admin
pnpm --filter @languon/admin test
pnpm --filter @languon/admin typecheck
pnpm --filter @languon/admin build
```

Use `$browser-verification` for changed admin journeys and request
`security-reviewer` for permissions, user data, bulk operations, exports, and
impersonation.
