# Architecture

## System boundaries

Languon begins as a modular monorepo. Applications own delivery concerns while
shared packages expose narrowly scoped capabilities. Cross-workspace imports
must use package public exports; applications must not import another
application's source files.

```text
web / admin / mobile
        |
        v
   HTTP contracts
        |
        v
     backend --------> (planned) private product object storage
        |                            |
        |                            v
        |                     scanner quarantine
        v                            |
   PostgreSQL <--------------- dictionary worker
        |                    |
        +--> Redis           +--> credentialless parser child process
                             +--> Mastra / model and OCR providers
                             +--> Langfuse
```

## Backend

The backend follows domain-driven design inside each business module:

```text
interface/infrastructure --> application --> domain
```

- Domain contains entities, value objects, domain services, and repository
  contracts. It has no Hono, database, cache, model-provider, or external SDK
  dependencies.
- Application coordinates use cases and depends on abstractions. Use
  constructor injection and explicit transaction boundaries.
- Infrastructure implements repositories and external adapters for PostgreSQL,
  Redis, Mastra, model providers, and Langfuse.
- Interface code owns Hono routes, authentication boundaries, request/response
  mapping, and OpenAPI declarations.

The dictionary worker is a separate process built from the backend image;
private product storage, scanning, parser sandboxing, and OCR remain planned for
the document milestone. Root worker composition owns timers, process signals,
concurrency, and readiness, then calls a dictionary application worker service
that owns the job/lease state machine. Dictionary infrastructure implements
PostgreSQL and provider ports. HTTP handlers will enqueue bounded work and return without
waiting for providers. Model, OCR, scanner, and object-storage SDKs will remain
behind application ports. Native document parsing will run in a separate
credentialless, egress-denied child-process sandbox inside the worker service;
the worker will validate its bounded IPC output before use. No additional
service/image topology is authorized by this sandbox boundary.

Validate all external data with Zod at its system boundary. Keep transport and
persistence representations out of domain objects.

## Web and admin

The public Next.js application uses a pages-first Feature-Sliced Design. Its
allowed dependency direction is:

```text
app -> pages -> widgets -> features -> entities -> shared
```

A layer imports only from lower layers. Next.js route files in `src/app/` stay
thin and compose page slices from `src/fsd/pages/`. FSD layers live below
`src/fsd/` because Next.js reserves a top-level `src/pages/` directory for the
legacy Pages Router. Server state belongs in TanStack Query when it needs client
caching; shared client state belongs in Zustand; component-local state remains
React state.

Frontend slices use `api`, `hooks`, `lib`, `model`, and `ui` segments only when
needed. Components live in one-component folders below `ui` and normally pair a
TSX file with a CSS Module. Shared design-system primitives live in `shared/ui`
and include colocated stories. Prefer semantic native elements, including
`dialog` and popover primitives, before custom interaction machinery. Avoid
prop drilling through unrelated components by selecting scoped context, shared
client state, or a typed `shared/lib` event bus according to ownership and
lifetime. Root ESLint configuration enforces the public-web FSD direction;
`.agents/skills/frontend-development/SKILL.md` defines the implementation
workflow.

The private administration application is a Vite SPA built with Refine, React
Router, and Ant Design. It uses `app -> pages -> widgets -> shared`: `app` owns
route/provider composition, `pages` owns route screens, `widgets` owns reusable
page composition, and `shared` owns API/auth/theme/i18n and low-level UI. It
shares only framework-neutral browser authentication protocol and coordination
through `@languon/browser-auth`; it never imports public-web application source.
ADR-0010 defines the framework, persistent owner membership, per-request
authorization, dedicated refresh cookie, and private-edge boundary.

Public-web visual behavior is owned by global semantic `--sys-*` variables, the
SSR-resolved Light/Dark/System preference, app-local primitives in
`apps/web/src/fsd/shared/ui`, colocated Storybook stories, and verified runtime
composition. `design/DESIGN_SYSTEM.md`, Figma Make, and `design/main.pen` may
provide design input but do not gate implementation. Visual changes synchronize
runtime code, affected stories/tests, and browser evidence; design artifacts are
updated only when explicitly in scope. ADR-0016 defines this ownership boundary.

The same design sources contain a separate Administration application variant
for dense operational screens. Admin maps those tokens to Ant Design light and
dark algorithms, retains a System preference, and implements tables, filters,
status labels, explicit mutation dialogs, and responsive navigation without
reusing the public web component implementation.

The web application keeps URLs independent of language. Its root layout selects
an allowlisted locale from the preference cookie, then `Accept-Language`, with
English fallback; server-loads a typed shared message catalog; and provides
translation and formatting helpers to the rendered tree. Manual selection
updates only the cookie and refreshes the unchanged route. ADR-0007 defines this
contract.

## Mobile

The Expo application groups user-facing screens separately from reusable
features, entities, and shared platform adapters. Platform-specific code must
be isolated behind an interface and verified on each affected platform.

## Contracts

`@languon/contracts` is the source of truth for data crossing application
boundaries. Export Zod schemas and derive TypeScript types from the schemas.
The backend uses the same schemas to generate and validate OpenAPI operations.

## Data and prompts

- PostgreSQL is the durable source of truth.
- Redis is used only for explicitly disposable cache, coordination, and
  short-lived state.
- Database access is implemented in backend infrastructure through
  `@languon/database`; domain and application layers never issue SQL directly.
- Local prompts in `@languon/prompts` are deterministic fallbacks for local,
  test, and staging workflows. Configured environments may resolve managed
  prompts through Langfuse, with local fallback on an unavailable prompt.

## Dictionary platform

This section records the accepted target boundary for implementation beginning
in Dictionary Platform M1. The `dictionaries` backend module owns typed current
dictionary, settings, card,
revision, job, proposal, and upload metadata. Current vocabulary will be
relational and directly queryable; schema-versioned JSON is limited to immutable
revision snapshots and untrusted review proposals. Each card belongs to one
dictionary, and a fork creates independent identities rather than shared mutable
content.

Future workbook, lesson, course, and exercise modules compose vocabulary through
explicit link tables to stable dictionary or card IDs. They may later pin an
immutable revision for publication, but do not depend on a generic asset payload.
[ADR-0011](./adr/0011-dictionary-persistence-and-composition.md) defines this
boundary.

AI generation and document ingestion are review-first asynchronous workflows.
PostgreSQL is their durable queue; a separately scalable worker command from the
backend image leases versioned jobs. Private product uploads enter quarantine,
must pass fail-closed malware scanning, and are deleted after terminal processing
or abandoned-input cleanup. Product storage credentials and lifecycle are
separate from database backups. [ADR-0012](./adr/0012-dictionary-worker-and-document-ingestion.md)
and the [operations design](./operations/dictionary-jobs-and-documents.md) define
the execution and trust boundaries.

## Release and deployment

Languon production artifacts remain four immutable OCI images: web, admin,
backend, and a one-shot migrator. The backend image supplies both the HTTP and
dictionary-worker commands; a worker is a separately managed service role, not
a fifth image identity. GitHub Actions publishes exact digest manifests to GHCR.
A manually dispatched staging run qualifies, builds, and
deploys the current `stage` commit; publishing a stable SemVer release from
`main` qualifies/builds only, and a separate protected manual workflow promotes
that already-built manifest to production. Ordinary pushes and pull requests do
not start release CI.

Every application host has one stable NGINX edge and blue/green Docker Compose
application slots. Deployment applies a backward-compatible singleton
migration, gates the inactive slot on dependency-aware readiness, validates and
reloads NGINX, then retains the previous containers while old connections drain
for up to five minutes. Application rollback promotes the previous digest
manifest through the same gates and never automatically reverses schema.

Each slot's worker overlaps during
promotion only for compatible versioned job formats and immutable generation
budget envelopes. The release manifest binds the shared API/worker token and
price ceilings, and deployment rejects a candidate whose jobs could not be
claimed by either the candidate or rollback-floor worker. A terminating worker will
stop leasing, cancel or finish bounded provider work, and release recoverable
leases. API readiness will not require live model, OCR, scanner, or
product-storage capability; worker capability and queue health will be separate
deployment and monitoring gates.

Staging initially places edge, both transient application generations,
PostgreSQL, and Redis on one VPS while keeping data volumes outside application
slots. Production separates the application host from a PostgreSQL/Redis data
host connected only by a provider private network. Admin and host management
remain on the private operator network; database/cache ports are never public.

The deployment core uses OCI, Compose, NGINX, SSH/Tailscale, and S3-compatible
storage so the provider remains replaceable. Timeweb panel/network details are
an operations adapter. See [ADR-0009](./adr/0009-release-and-deployment-platform.md)
and the [operations handbook](./operations/README.md).

This document describes the current structure and boundaries. ADRs under
[`docs/adr`](./adr/README.md) explain why durable choices were made. Read the
relevant accepted ADRs before changing a boundary. Keep feature-local choices in
the active `EXEC_PLAN.md`; promote choices that future features must respect to
an ADR before implementation diverges from the documented architecture.
