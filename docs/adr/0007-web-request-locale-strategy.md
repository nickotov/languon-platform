# ADR-0007: Web request locale strategy

Status: Accepted
Date: 2026-08-14
Supersedes: ADR-0006

## Context

The web application needs server-rendered English, Russian, French, and Spanish
content, an in-app language choice, and stable application URLs. The product
owner explicitly rejected language codes in path segments: changing language
must not redirect or rewrite `/login`, `/security`, or any other route.

## Decision

Keep all web URLs independent of language. During each server render, select an
allowlisted locale from the `languon-locale` cookie first, then the request's
`Accept-Language` header, and finally English. Reading request cookies and
headers deliberately makes localized pages request-rendered so SSR content,
metadata, and `<html lang>` agree.

Own type-checked message catalogs in the web application's shared i18n slice.
Load the selected catalog in the root layout and provide locale, translation,
formatting, and stable internal-path helpers through a scoped React provider.
All user-facing component copy and localized metadata use catalog keys. UI code
maps stable API error codes and browser failures to localized messages rather
than displaying English transport details.

Persist a manual language selection in a non-sensitive, same-site cookie and
refresh the current App Router route. The refresh does not mutate path, query,
or fragment. Expose the choice through an accessible native select in a global
top-right header.

## Alternatives considered

### Locale-prefixed paths

Paths such as `/en/login` make locale explicit and cache-friendly, but they
change product URLs and require redirects and locale-aware navigation. The
product owner rejected this behavior.

### Client-only locale state

This keeps stable URLs but produces incorrect SSR, localized metadata only after
hydration, and a flash of the wrong language.

### Account-only persistence

This excludes signed-out users and requires backend persistence. A cookie works
before authentication and can later be synchronized with account preferences if
the product adds that capability.

### A third-party i18n runtime immediately

The current fixed locale set needs typed catalogs, interpolation, dates, SSR,
and selection. A repository-owned layer meets that scope without a dependency;
a future ADR can introduce ICU/plural tooling or a translation platform.

## Consequences

### Positive

- Language changes never alter or redirect product URLs.
- SSR content, metadata, accessibility copy, and document language agree.
- Manual preference works for signed-out and signed-in users.
- New component copy has one typed, reviewable source per locale.

### Negative

- The same URL can render different languages and therefore must vary by request
  cookie/header rather than being globally static.
- Catalog completeness grows with the web UI and must be maintained in four
  languages.
- Shared caches must respect the request-varying render behavior.

### Risks / limitations

- Translation quality still requires human review by fluent speakers.
- The minimal formatter does not provide ICU plural/select syntax.
- Admin, mobile, backend e-mails, and API transport messages remain outside this
  decision.

## Related

- [`docs/architecture.md`](../architecture.md)
- [`ADR-0005`](./0005-frontend-component-and-fsd-standards.md)
- [`ADR-0006`](./0006-web-internationalization-strategy.md)
- [Feature specification](../../.agent/features/web-i18n-support/FEATURE.md)
- [Execution plan](../../.agent/features/web-i18n-support/EXEC_PLAN.md)
