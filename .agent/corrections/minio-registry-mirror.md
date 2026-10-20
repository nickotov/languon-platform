# Correction: Restore local MinIO image pulls

Status: Complete
Created: 2026-10-20
Updated: 2026-10-20
Base: 0270144

## Routing / scope

Bounded correction to existing local-development and disposable-test image locations. Existing upstream server/client SHA-256 indexes and all platform manifests stay identical, so no runtime dependency version, schema, API, storage behavior, production infrastructure or security policy changes. No feature lifecycle required. Preserve user work, volumes, buckets and credentials. User authorized a local commit after verified completion; no push authorized.

Root and test compose currently use unavailable minio/minio and minio/mc repositories. Quay exact-digest inspections return401; Google cache returns not found. Docker live inspections verify heifeng/minio and heifeng/mc expose the exact existing index digests and ARM64/AMD64/PPC64LE manifests. An alternate registry does not gain authority to substitute content because immutable digests remain fixed.

## Acceptance / plan

- AC-1: Development and disposable-test compose use reachable replicas with unchanged digests.
- AC-2: Existing private, persistent development storage, isolated tests and scoped initializer policies remain intact; pnpm dev:infra starts successfully.

Update only both compose image locations and matching existing assertions, explain in README, run focused static/service tests, pull and start normal development infra, inspect status and MinIO health without exposing credentials. Do not reset volumes or change application code.

## Verification

Live exact-digest inspections passed for heifeng/minio@sha256:a1ea29fa28355559ef137d71fc570e508a214ec84ff8083e39bc5428980b015e and heifeng/mc@sha256:aead63c77f9db9107f1696fb08ecb0faeda23729cde94b0f663edf4fe09728e3. Registry checks completed; no stalled check remains. Python registry fallback failed local CA validation; no TLS bypass used. Pull/start and focused checks completed; final results below.

## Documentation / review / risk

Existing dictionary-pronunciation-audio and dictionary-platform guides use unchanged commands and expected storage behavior, with no image URL promise or changed source mapping; no guide/test scenario change required. No browser evidence needed for local configuration only. No schema/query/cache lifecycle changes, so no database migration checks. Author review sufficient for a same-content registry repair with verified immutable identities; no material new trust policy. Existing images are retained releases, not an upgrade; mirror availability may change independently. Removal/rollback: restore prior image locations (currently unavailable) or select another replica proving the same digests.

Initial verification progress: focused3 infrastructure tests, affected ESLint, scoped Prettier and diff checks pass. Exact Compose comparison proves only2 registry names per file changed; every digest and all settings are byte-identical otherwise. Normal pnpm dev:infra attempt was blocked by four docker-credential-desktop get children (not network or mirror); stopped only the owned startup/helper PIDs. Retrying the same Compose services with a temporary empty Docker client config and explicit existing local unix socket, leaving the user's config untouched; public image layers are now downloading successfully. No auth secrets or env dumps printed.

## Final outcome and evidence

- AC-1: both mirror images successfully pulled from heifeng with the original exact indexes. Both development and disposable-test files retain original digests, commands, bindings, volumes, credentials and policies. No new image build or version introduced.
- AC-2: temporary anonymous-client Compose startup completed0; original unmodified `pnpm dev:infra` then completed0 with cached images. PostgreSQL/Redis healthy, MinIO running, initializer exited0; configured MinIO readiness endpoint returned HTTP200. No data volumes reset or removed. User Docker client settings unchanged. Owned blocked credential processes stopped; temporary empty client configuration removed after verification. Normal development services intentionally remain running.
- `node --test infra/dev/speech-services.test.mjs infra/test/document-services.test.mjs`:3/3 pass.
- Targeted ESLint, Prettier and `git diff --check` pass. No app source/API/schema/UI change; app build/browser/DB migration suites are not applicable. Existing user-flow commands/results/source mapping remain valid; no guide prose or E2E marker changes required.
- Author preflight confirmed bounded6-file scope including this record and no unrelated changes. No independent review required for a local-only registry repair retaining exact cryptographic content identity. User subsequently requested a local commit; no push authorized.

## Final checked file identity (base0270144, uncommitted patch)

- `compose.yaml`: `99918c42819a37daee928586b6128ddc08a6b0ec769279a1bba793887dd8a2af`
- `infra/test/document-services.compose.yaml`: `4b9516cef350fcd6b83c8e9015e85258048577829f1c032840d91a9ec87c6dd1`
- `infra/dev/speech-services.test.mjs`: `5c6cb8f1379547ac19dbed879123b2ec1ed158415077e5a9546eeda6ab34866f`
- `infra/test/document-services.test.mjs`: `8df55f196adbe098b2ec69e640d58728634e426607a32bcd60d55871918e43b3`
- `README.md`: `7a47aab931e58111703c594f7e2a8062a1a56b56fde8bb881405ae774c042f88`

## Remaining limitations

Mirror availability may change. Existing retained image versions are unchanged. The local Docker Desktop credential helper blocked the first uncached attempt; anonymous public pulls worked and subsequent ordinary startup passed. A future uncached pull may need the local credential helper unlocked; no permanent Docker auth changes were made for this correction. No implementation or required verification remains.
