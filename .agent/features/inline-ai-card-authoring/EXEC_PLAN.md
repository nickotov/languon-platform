# ExecPlan: Inline AI Card Authoring

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-26

## Goal

Let a dictionary owner create a high-quality card from only a source phrase by
reviewing and applying AI suggestions inline, one field at a time, without AI
overwriting manual content or deleting earlier alternatives.

## Specification

- In scope and out of scope: see `FEATURE.md`.
- Related completed platform: `../dictionary-platform/`.
- Governing ADRs: ADR-0011 typed dictionary persistence, ADR-0012 durable worker/
  proposal execution, ADR-0016 runtime UI-kit authority, plus ADR-0005 web FSD,
  ADR-0007 locale requests, and ADR-0009 rollout compatibility.

## Existing architecture

- Manual creation uses `DictionaryCardForm` local draft state and
  `POST /dictionaries/:dictionaryId/cards`; the service/store atomically validates
  versions/settings/capacity, inserts a human card plus `manual_create` revision,
  warns rather than rejects duplicates, and bumps dictionary version.
- Existing `single-card:v1` requires a persisted active `cardId`, card version,
  original snapshot, and acceptance that updates that card. Its separate review
  panel can select provider-returned alternatives but cannot create a card,
  target one field, accumulate suggestions, or preserve Add Card manual input.
- The generation subsystem already supplies cardless non-single job constraints,
  typed JSON input/proposal unions, idempotent enqueue, leases/fencing/heartbeats,
  budgets/circuits, safe failures, proposal expiry/redaction, worker format
  dispatch, capability metadata, and two-release deployment overlap.
- The new format therefore extends the existing generation aggregate rather than
  creating a placeholder card, reusing batch semantics, or adding a second queue.

## Architecture and data flow

`card-authoring:v1` is a cardless generation kind. Its input contains the trusted
dictionary/settings/pair snapshot, source, complete bounded draft values and
overrides, resolved effective settings, `scope: all | field`, optional predecessor
job ID, and discarded suggestion IDs. The provider sees only languages, effective
settings, source, relevant bounded draft context, and requested target fields.

The provider returns a delta with one optional suggestion per requested field.
Completion loads the predecessor's review proposal under lock, removes explicitly
discarded identities, appends distinct server-identified suggestions, enforces
six per field, and publishes one cumulative successor proposal. The predecessor
remains immutable and independently expires; failures leave it reviewable.

The web owns the open-form draft, hidden/accepted suggestion IDs, current source
fingerprint, and latest successor job. Accept/Discard never mutates a card.
Regeneration sends the current draft, predecessor, and hidden IDs through one
payload-scoped retained idempotency attempt. Source changes stale the lineage.

Final acceptance sends the complete candidate and selected suggestion identity
per contributing field. The store locks owner/dictionary/settings/job/proposal,
rechecks snapshot and constraints, validates identities, creates one card and
revision using the same invariants as manual creation, derives `mixed`, stores an
exact accepted outcome/fingerprint, and redacts content. With no accepted
suggestion the web uses ordinary manual creation and discards the review job.

## Acceptance criteria

- [x] AC-1 through AC-12 from `FEATURE.md` are implemented and evidenced.

## Test strategy

- Unit: proposal merge/dedup/bounds, target-field resolution, source-stale UI,
  suggestion accept/discard, idempotency, deterministic/provider DTO validation.
- Contract: discriminated job, proposal/delta, enqueue/successor/accept schemas,
  capability, endpoint inventory, bounds, strict malformed-input rejection.
- Integration: HTTP authorization/error mapping and real PostgreSQL enqueue,
  predecessor merge, field scope, discard freeing capacity, atomic accept/replay,
  authorship, duplicate/capacity/version conflict, expiry/redaction and circuits.
- E2E: one critical source-only Add Card journey through real API/database and
  deterministic worker; lower tests cover the edge matrix.
- Browser/device: 320, 390, 768 and desktop, light/dark, keyboard, 200% text,
  long LTR/RTL, progress/error/stale/cap states, console/network inspection.
- Database migration: generated Drizzle migration plus disposable PostgreSQL.
- Security review: required for model I/O, SQL, budgets, persistence and rollout;
  no new external provider or trust boundary is allowed.
- User-flow guide/E2E: update `docs/user-flows/dictionary-platform.md`, add
  `inline-ai-card-authoring-preserves-field-choices` to the existing mapped file,
  refresh revision and run guide/mapping plus mapped Playwright verification.

## Milestones

- [x] M1 — Product and architecture contract
    - Objective: establish the missing authoring job and precise inline UX.
    - Acceptance criteria: decision-complete AC-1–AC-12.
    - Evidence: current flow is saved-card-only; independent product and
      architecture audits agree a cardless versioned format is required.
- [x] M2 — Contracts, domain, provider, persistence, and HTTP
    - Objective: implement durable cumulative suggestions and atomic creation.
    - Acceptance criteria: AC-2–AC-9.
    - Tests: contracts/domain/provider/worker/service/routes, PostgreSQL, rollout.
- [x] M3 — Inline shared-kit Add Card experience
    - Objective: expose AI authoring without degrading manual creation.
    - Acceptance criteria: AC-1, AC-3–AC-8, AC-10.
    - Tests: focused API/component/state tests and Storybook build.
- [x] M4 — Guide, browser journey, full validation and review
    - Objective: verify cross-app behavior and resolve material findings.
    - Acceptance criteria: AC-1–AC-12 and repository feature DoD.
    - Tests: mapped Playwright, browser wrapper, full checks, disposable database,
      independent tester/reviewer/security-reviewer.

## Progress

- 2026-08-26 — User identified missing AI-assisted creation and specified inline
  field proposals with Accept/Discard/Regenerate, whole regeneration, and
  preserved choices.
- 2026-08-26 — Created `feature/inline-ai-card-authoring`; inspected completed
  dictionary artifacts, guide/design guidance, ADRs, code, contracts and tests.
- 2026-08-26 — Independent product and architecture discovery confirmed
  `single-card:v1` is saved-card-only and a cardless format is required.
- 2026-08-26 — M2 and M3 landed: contracts/domain/provider, generated migration,
  durable lifecycle, worker/rollout, inline shared-kit UI, four locales and
  focused tests are green.
- 2026-08-26 — Fresh PostgreSQL migration/store verification and the mapped
  deterministic Chromium journey passed; `pnpm check` passed repository-wide.
- 2026-09-10 — Independent findings were remediated: regeneration now requires
  exact distinct output, discarded history survives successor and settings-toggle
  paths, stale predecessors fail before provider work, duplicate warnings replay,
  manual acceptance is atomic, and legacy single-card acceptance remains valid.
- 2026-09-10 — Correctness, test, and security reviews approved; full repository,
  mapped Chromium, and fresh PostgreSQL verification passed.
- Current work: complete.

## Decisions

- D-1 — New cardless `card-authoring:v1`: reuse durable generation machinery;
  reject placeholder cards, batch semantics and weakening `single-card:v1`.
- D-2 — Cumulative immutable successors: copy predecessor review, remove explicit
  discards, deduplicate and append targeted output; provider failure leaves the
  predecessor usable.
- D-3 — Six suggestions per field: never evict an undiscarded choice; discard
  frees capacity on the next successor.
- D-4 — Explicit AI contribution yields `mixed`: one or more validated selected
  suggestion IDs produces mixed authorship; manual-only stays human.
- D-5 — Open-draft retention: server proposals are durable, but local draft/
  selection/hidden state lasts for the open overlay; deliberate close abandons it
  and source change stales the lineage. No browser proposal storage.
- D-6 — True field targeting: provider input requests exactly one field or all
  eligible fields; field regeneration never pays for unrelated output.
- ADR impact: all decisions are feature-local applications of accepted ADR-0011
  and ADR-0012; no new ADR is required.

## Discoveries

- Existing proposals support up to three alternatives per field, but only inside
  a whole existing-card replacement and cannot power source-only creation.
- The default release and `.env.example` intentionally expose no live AI formats.
  Local deterministic evaluation needs explicit worker/capability configuration;
  production defaults must remain inert.

## Validation

| Check              | Status | Evidence                                         |
| ------------------ | ------ | ------------------------------------------------ |
| Unit               | Passed | Backend 470, web 131, contracts 52, prompts 5    |
| Integration        | Passed | HTTP/worker suites and guarded PostgreSQL 6/6    |
| Contract           | Passed | Contracts 51/51 and strict authoring schemas     |
| E2E                | Passed | Mapped deterministic Chromium journey, 47.1s     |
| Browser/device     | Passed | Pinned wrapper at 320x800; 200% covered in E2E   |
| Typecheck          | Passed | All 10 workspaces in `pnpm check`                |
| Lint               | Passed | Repository ESLint in `pnpm check`                |
| Build              | Passed | All 9 production builds in `pnpm check`          |
| Database migration | Passed | Generated 0018, db:check, classification, PG 6/6 |
| User-flow guide    | Passed | Guide checker 16/16; 8 guides                    |
| User-flow E2E      | Passed | Mapping check and mapped scenario passed         |
| Independent review | Passed | Final re-review approved; no material findings   |
| Security review    | Passed | Approved after model-boundary remediation        |

## Remaining work

- Keep production capability disabled until a compatible provider-approved
  expand/activate release passes the existing gates.
