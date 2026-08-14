# Web internationalization and language switcher

Status: Complete
Owner: Codex
Created: 2026-08-14

## Problem

The web application renders every user-facing surface in English and has no
server-rendered locale contract. Users cannot choose a language, retain that
choice, or receive localized authentication and home-page content.

## Desired behavior

The web application renders content in English, Russian, French, and Spanish on
stable, language-independent URLs. A language selector remains available in the
top-right header on every page, refreshes the current route without changing its
path or query, and persists the choice in a cookie. SSR emits the selected
language in both content and the document `lang` attribute.

## Acceptance criteria

- [x] AC-1 — Existing routes server-render the locale selected from the request
      and set the matching `<html lang>` value without changing the URL.
- [x] AC-2 — Locale selection uses the allowlisted locale cookie, then
      `Accept-Language`, with English as fallback.
- [x] AC-3 — A labeled language selector appears in the top-right header on
      every web route and switches locale while preserving path and query state.
- [x] AC-4 — The selected locale persists across reloads and later unprefixed
      navigation without storing personal or sensitive data.
- [x] AC-5 — All user-facing component copy and page metadata in `apps/web` is
      supplied through the i18n catalogs for English, Russian, French, and Spanish.
- [x] AC-6 — Existing authentication URLs and navigation remain unchanged and
      functional, including return paths and verification/recovery redirects.
- [x] AC-7 — Automated tests, mapped browser E2E, real-browser verification,
      documentation, and independent review prove the feature.

## Scope

### In scope

- Web App Router request-locale resolution and SSR localization on stable URLs.
- English, Russian, French, and Spanish message catalogs.
- Typed translation/interpolation and locale-aware navigation utilities.
- Global web header and accessible language selector.
- Translation of current home and authentication UI, metadata, validation,
  status, error, date, and accessibility copy.
- Updates to the existing authentication journey and a new localization guide.

### Out of scope

- Admin and mobile application localization.
- Backend-generated email or API message translation.
- User-account language persistence in PostgreSQL.
- Regional locale variants, right-to-left languages, or a translation CMS.

## Constraints and risks

- Preserve established FSD direction and keep App Router files thin.
- Do not trust arbitrary locale path or cookie values; allowlist four locales.
- Do not expose backend English error details as the primary localized UI copy.
- Preserve unrelated `package.json` and generated `next-env.d.ts` worktree edits.
- Language selection must never add, remove, or rewrite a URL path segment.

## User-flow documentation

- Required: browser journey.
- Guide: `docs/user-flows/web-i18n-support.md`.
- Related guide: `docs/user-flows/user-authentication.md` because every
  authentication URL and visible label becomes locale-aware.
- Localization scenarios in `apps/web/tests/e2e/i18n.journeys.spec.ts`:
  `ssr-locale-routing` and `language-switch-persistence`.
- Existing authentication scenarios remain in
  `apps/web/tests/e2e/auth.journeys.spec.ts` and retain their current URLs.

## Open decisions

- None. The supported locales, selector location, and SSR requirement are
  explicit; English is the safest existing-behavior fallback.
