# Web architecture instructions

## Architecture

Use pages-first Feature-Sliced Design. Allowed dependency direction is:

```text
app -> pages -> widgets -> features -> entities -> shared
```

A layer imports only from lower layers. Keep Next.js `src/app` route and layout
files thin: they own framework routing, metadata, and provider composition, then
render page slices from `src/fsd/pages`. Keep FSD layers under `src/fsd` because
Next.js reserves a top-level `src/pages` directory for its legacy router.

Expose slices through a public entry point when a slice gains multiple modules.
Do not deep-import another slice's internals. Put reusable business behavior in
`features` or `entities`, not route files or generic UI components.

## State and rendering

- Prefer Server Components and server-side data access when interactivity is not
  required.
- Use TanStack Query for client-cached server state, Zustand for genuinely shared
  client state, and React state for local UI state.
- Validate remote data at the boundary with schemas from `@languon/contracts`.
- Keep loading, empty, error, retry, and accessibility behavior explicit.
- Avoid hydration-dependent behavior for essential content.

## Commands

```sh
pnpm dev:web
pnpm --filter @languon/web test
pnpm --filter @languon/web typecheck
pnpm --filter @languon/web build
```

User-visible changes require `$browser-verification` against the running app.
Record the viewport, journey, observations, console/network failures, and
artifacts in the active `EVIDENCE.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
