# Texts web API adapter review

Date: 2026-10-15
Reviewer: Independent GPT-6.1 Sol
Mode: Initial, bounded correctness/security checkpoint
Verdict: Approved for the bounded, unused web API adapter after WEB-API-01 remediation. No open material correctness/security findings in this scope.

## Boundary and identity

Reviewed the untracked `apps/web/src/fsd/entities/texts/**` and `apps/web/tests/texts-api.test.ts` against HEAD `be28f1ec1de6413fd0934a284bbb97f23de723a2`. Compared every adapter endpoint with the three current backend route modules and Texts contracts; checked shared browser-auth error/refresh compatibility and the web API URL helper. Backend implementation, design/UI fidelity and whole-feature completion are outside this checkpoint. The existing backend security review remains intact.

Initial SHA-256 identities:

```text
00a691a23e90a8e2b8b46afe541da42232396687dc89a9cee090600f21fe2349  apps/web/src/fsd/entities/texts/index.ts
0180b52de02493d2f54c370b274ee43a0cc7759d32b9134b13ec9a1ce3178c02  apps/web/src/fsd/entities/texts/api/content.ts
51e5f12feedf7ef9eafbd9eb4af5d4deac76d1e88af0b6f032db406591184774  apps/web/src/fsd/entities/texts/api/jobs.ts
290f4f9300f31164ddf07543c8e130db16c01cd3cbe968098cbedf0e7babdfa4  apps/web/src/fsd/entities/texts/api/sharing.ts
c120742dd63e6e4d54d276a88e728fd78909cced81efcd950e147078509be449  apps/web/src/fsd/entities/texts/api/transport.ts
0fc9f9ce367d950ab5b64d1ff6538d214e586eeab5cf39c985838401a0d4b9bc  apps/web/tests/texts-api.test.ts
```

## WEB-API-01 — Medium — Body consumption masks request cancellation

- Location: `apps/web/src/fsd/entities/texts/api/transport.ts:74`.
- Scenario: Fetch has resolved after response headers arrive, but the JSON body is still downloading. The caller aborts its supplied signal, causing `response.json()` to reject with `AbortError`. The unconditional body-read catch discards that exception, then the response validation throws `TextsApiError(502)` (or projects an HTTP failure for a non-2xx response).
- Impact: A cancelled Texts read/poll is reported as a service failure. Consumers cannot suppress cancellation as intended and can present spurious errors or retries during navigation/replacement requests. Large text responses make cancellation during body consumption a real path. The existing cancellation test covers only fetch rejection.
- Fix: Preserve `AbortError` in the JSON-read catch using the same discrimination as the fetch catch. Keep malformed JSON handling for other failures. Add regressions where fetch resolves but `response.json()` rejects with the original abort object, for success/error HTTP statuses.
- Status: Closed after focused remediation review below.

## Other assessed behavior and evidence

- Endpoint paths, methods, successful envelopes and 204 share revocation match the current backend. Contract parsing validates identifiers, capability shapes, request bodies and successful responses. Caller operation IDs, optimistic versions, offsets, Unicode and duplicate confirmation survive serialization; the adapter introduces no hidden mutation retry.
- Capabilities travel only in `X-Languon-Share-Key`; opaque locators are encoded in paths, raw capability keys are absent from URLs/bodies/logging, and requests use `cache: no-store`. Vocabulary and content sharing use the same current header.
- Errors retain selection-specific codes and optional correlation fallback; `TextsApiError` inherits `BrowserApiError`, preserving the existing 401 session-refresh discriminator. Schema failures become bounded generic errors rather than exposing raw bodies.
- Independently executed `pnpm --filter @languon/web exec vitest run tests/texts-api.test.ts`: 10/10 passed. Author-reported scoped lint/typecheck assessed but not duplicated.
- This is an unused API adapter with no rendered UI change; browser/design fidelity verification is not applicable to this bounded checkpoint.

## Focused remediation review and final identity

The body-read catch now rethrows both DOMException and Error instances named `AbortError`, preserving the original cancellation object. Other JSON failures retain the generic error projection. New regressions cover both object types on HTTP 200 and 409 responses after fetch has resolved. Independently reran `pnpm --filter @languon/web exec vitest run tests/texts-api.test.ts`: 12/12 passed. Author reports web typecheck, scoped lint and diff check passed. WEB-API-01 is resolved; no additional issue found in the repair.

Final reviewed HEAD remains `be28f1ec1de6413fd0934a284bbb97f23de723a2`. Four other adapter hashes above remain unchanged. Updated source/test identities:

```text
16c3f297db054d13ee8256e562a56df0374fc0b42626ddd300f6e1af702ebf22  apps/web/src/fsd/entities/texts/api/transport.ts
6511b8886a73fb940f143c0c9b8a0acd499943edaab1ef3ca67c77610b821e0b  apps/web/tests/texts-api.test.ts
```

This approval covers only the adapter checkpoint and does not approve unseen UI work or establish supplied-design fidelity, browser acceptance, or whole-feature completion.
