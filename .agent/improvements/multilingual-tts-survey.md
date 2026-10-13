# Improvement: Multilingual TTS research survey

Status: Complete
Created: 2026-10-12
Updated: 2026-10-13

## Routing and scope

Documentation-only improvement: research the user's speech-playback decision
and save an indexed survey using `$survey`. No runtime capability, contract,
dependency, schema, security policy, infrastructure, or accepted ADR changes.
The user requested help deciding, not feature implementation. Proposed sentence,
native, Hungarian-catalog, and cross-user cache changes remain separate feature
scope. No backlog implementation/completion is authorized. Git commits were
initially out of scope; the user subsequently explicitly requested this commit.

Read root instructions, survey/search/improvement/testing skills, metadata and
indices; dictionary feature 027 plan/specification, guide and accepted ADR-0020;
sentence feature context and focused audio/language/mobile source. Initial Git
state was clean on `main`. Source inspection uses bounded text searches; no
semantic caller-completeness or runtime proof is claimed.

Scope: this record, `docs/surveys/multilingual-text-to-speech-playback.md`, and
the survey index. Existing user-flow behavior and mapping stay unchanged.
Rollback: remove the new research document/record and its index row.

## Acceptance criteria

- AC-1 — Explain web/device/cloud/self-hosted options, multilingual provider
  candidates, costs, and pronunciation-quality uncertainty using primary sources.
- AC-2 — Answer cross-user audio reuse, identify existing app seams/constraints,
  and preserve authorization/retention boundaries as proposals.
- AC-3 — Save dated, indexed research with valid metadata, links, formatting,
  and no unsupported claims of live-provider quality or implemented behavior.

## Initial plan — 2026-10-12

- [x] Inspect existing context and research primary sources.
- [x] Incorporate user priority: consistent natural pronunciation; all vendors
      are valid comparison candidates, with proxy availability asserted by user.
- [x] Write proposal-only survey and index entry.
- [x] Validate documentation and inspect final diff.
- [x] Record evidence and close.

## Verification and review

Scoped Prettier, metadata/source-path/local-link inspection and
`git diff --check` pass. Runtime/browser/database/build/unit/E2E checks are not
applicable to research-only files. No user-flow or backlog updates are needed.
A bounded independent agent researched Google/Azure facts, including live price
and model-control changes; root owns synthesis and document verification.
Independent implementation/security review is unnecessary: no executable or
trust-boundary change. Paid evaluation was neither authorized nor performed.

## Initial outcome and evidence — 2026-10-12

- AC-1: Saved dated provider/approach comparisons with primary-source links.
  Independently researched Google/Azure facts avoid outdated WaveNet pricing
  and blanket claims about newer voice controls. Exact Azure/Kie/OpenAI prices
  and quality remain explicitly unverified; no benchmark winner is invented.
- AC-2: Documented backend/S3 proposal, cross-user rendition identity and
  lifecycle concerns, current dictionary-only deduplication, model pinning,
  absent Hungarian catalog entry, and native/sentence implementation boundaries.
  User answers are preserved without treating proxy use as verified eligibility.
- AC-3: Survey frontmatter/date/index agree. Inline standard-library Python
  inspection checked metadata, all listed source paths, index presence/date,
  and seven local file links across the three scoped files. External URLs were
  researched selectively; no blanket link-availability claim is made.
- Commands: `pnpm exec prettier --write` followed by `pnpm exec prettier --check`
  on the survey, index, and this record; `git diff --check`; bounded Git state
  and author content inspection. All pass. No runtime tests or dependency edits.
- Tested environment: Node v24.8.0, pnpm 10.13.1, base `cd3ffc4`, with only the
  three scoped Markdown changes. Survey/index SHA-256 of sorted path, NUL,
  bytes, NUL: `e7ea5af9cef6d0da960f4c35494d293f6449bf66ec00a7e29c638443d318bda5`.
  This identifies the original 2026-10-12 survey/index patch. The requested
  2026-10-13 update below supersedes its recommendation and document hash.
- Final preflight: no application/user-flow/backlog/ADR changes, secrets,
  generated output, infrastructure actions, paid calls, or commits. Proposed
  future work is not marked implemented or accepted.

## Remaining risks

Actual pronunciation/latency, exact Azure/Kie/OpenAI price quotes, commercial
account access, reseller rights/retention, and production storage evidence remain
unverified. The survey explicitly identifies these gaps and a bounded experiment.

## Requested update — 2026-10-13

The user explicitly requested updating this survey to prefer a provider that
does not block requests from Russia. Reuse the same documentation improvement;
no feature implementation or provider account/probe is authorized. Preserve
the existing uncommitted survey/index/record and the original dated cost/source
evidence. Update the recommendation, access comparison, verification gates,
research date and index consistently.

- AC-4 — Treat Russian request-origin access, account eligibility and payment
  as separate requirements. Prefer providers with relevant official evidence;
  never equate a proxy, Russian localization, or no published ban with proven
  support. Record exact WaveNet access and requested-language gaps separately.
- [x] Read current durable record/survey/index, root instructions and Git state.
- [x] Research official regional/provider/API evidence; delegate only bounded
      independent Google/Azure/Kie/Eden/Sonna policy research, without edits.
- [x] Revise recommendation and survey/index with dated evidence boundaries.
- [x] Validate changed documentation and record final evidence/status.

### Update outcome and evidence

- AC-4: Added a dated regional comparison and access gate; recommendation now
  prioritizes Zvukogram's explicit Russia-without-VPN/Russian-card claim, with
  APIHOST as a regional alternative and Kie/SonnaLabs/Eden conditional. Official
  ElevenLabs blocking, Google signup pause, and Microsoft sales suspension are
  distinguished from unknown API reachability. No inference that proxy use or
  intermediary billing establishes an upstream regional exception.
- Direct WaveNet through SonnaLabs is documented; Russian-origin service
  eligibility remains unverified. Zvukogram's catalog explicitly lists Hungarian
  (`hu`, line 118), French and Turkish, but its exact selected API voices/engine,
  paid quality and cross-user output-use terms remain unverified. The research
  reader's public `/voices` fetch failed; no successful Russian-origin API test
  or guarantee of continued availability is claimed.
- Preserved 2026-10-12 cost observations as explicitly dated direct-engine
  background; no reseller price substitution. Added change history and updated
  research date/index scope to 2026-10-13. Source/context and application behavior
  remain unchanged. No backlog, user-flow or ADR update applies.
- Independent read-only agent corroborated Google/Azure restrictions and
  Kie/Eden/Sonna policy uncertainty; root inspected regional API/payment/language
  evidence and the authored content. No executable/security-policy change means
  no independent implementation or security review is required.
- `pnpm exec prettier --write` / `--check` on all three scoped Markdown files
  and `git diff --check` pass. Standard-library Python inspection verified
  frontmatter/H1, all source paths, seven local links, date/index agreement,
  dated historical pricing, and removal of the obsolete geographic assumption.
  Git state remains `main` at `cd3ffc4` with only the original three scoped
  uncommitted files. No runtime/browser/database/test/build/paid checks apply.
- Updated survey/index SHA-256, sorted path + NUL + bytes + NUL:
  `bd36a0de4e5e3bc56bd6652e8ee0c7b5cd559e94ee532d793252dc8d4c7e4d2e`.
  Final record-only evidence edits do not invalidate these survey/index checks.

### Update remaining risks

No live Russian-origin synthesis, commercial onboarding/payment, or native-speaker
quality evidence. Selected intermediary voices/rights/prices/retention still need
validation. These are provider-selection limits, not unfinished documentation.

## Git handoff — 2026-10-13

The user explicitly requested committing the completed survey. Scope is this
record, the survey and its index entry. Final scoped formatting and whitespace
checks pass; commit locally on the current branch without pushing.
