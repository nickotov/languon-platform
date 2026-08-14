# ADR-0006: Web internationalization strategy

Status: Superseded by ADR-0007
Date: 2026-08-14
Supersedes: None

## Context

The web application needs server-rendered English, Russian, French, and Spanish
content, stable localized URLs, an in-app language choice, and a consistent way
for future web components to obtain copy. Client-only locale state would render
the wrong initial language and make URLs and caches ambiguous. No localization
runtime is currently installed.

This locale-prefixed URL strategy was rejected during feature implementation in
favor of stable URLs with request-header and cookie selection. ADR-0007 records
the active decision; this record remains only to preserve the considered
alternative.

## Decision

Place every web route beneath an allowlisted locale segment and use Next.js
`src/proxy.ts` to redirect unprefixed requests. Choose the redirect locale from
the allowlisted locale cookie, then the request's `Accept-Language` header, and
finally English. Keep legacy unprefixed links usable through this redirect.

Own type-checked message catalogs in the web application's shared i18n slice.
Load the selected catalog during the locale root layout's server render and
provide locale, translation, formatting, and locale-aware path helpers through
a scoped React provider. All user-facing component copy and localized metadata
must use catalog keys. Keep API/transport messages out of catalogs; UI code maps
stable error codes and browser failures to localized messages.

Persist language selection in a non-sensitive, same-site cookie and expose the
choice through an accessible native select in a global header. Switching
language replaces only the locale path segment and preserves the remaining path
and query.

## Alternatives considered

### Client-only locale state

This avoids route changes but produces incorrect SSR, hydration-dependent
essential content, and unshareable localized URLs.

### Unprefixed routes with cookie-driven rendering

This keeps shorter URLs but makes a single URL render different languages and
complicates caching, indexing, and deterministic testing.

### A third-party i18n runtime immediately

Libraries can add ICU parsing and advanced routing, but the current app needs a
small fixed locale set, interpolation, dates, SSR dictionaries, and path
switching. A repository-owned layer follows current Next.js guidance without a
new dependency. This ADR does not prohibit adopting a library when plural rules,
rich messages, extraction tooling, or a translation service justify it.

## Consequences

### Positive

- SSR, document language, URLs, and visible copy agree before hydration.
- Locale input is constrained at the request boundary.
- New component copy has one typed, reviewable source per locale.
- The language choice works without account persistence or backend changes.

### Negative

- Every internal navigation path must use the shared locale helper.
- Catalog completeness grows with the web UI and must be maintained in four
  languages.
- Locale prefixes change canonical web paths, though redirects preserve old
  entry points.

### Risks / limitations

- Translation quality still requires human review by fluent speakers.
- The minimal formatter does not provide ICU plural/select syntax; adopt a
  compatible library through a future superseding decision if that becomes a
  product requirement.
- Admin, mobile, backend emails, and backend transport messages remain outside
  this decision.

## Related

- [`docs/architecture.md`](../architecture.md)
- [`ADR-0005`](./0005-frontend-component-and-fsd-standards.md)
- [Feature specification](../../.agent/features/web-i18n-support/FEATURE.md)
- [Execution plan](../../.agent/features/web-i18n-support/EXEC_PLAN.md)
