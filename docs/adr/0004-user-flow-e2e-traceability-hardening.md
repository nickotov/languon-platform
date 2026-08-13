# ADR-0004: User-flow E2E traceability hardening

Status: Accepted
Date: 2026-08-13
Supersedes: [ADR-0003](./0003-user-flow-e2e-traceability.md)

## Context

ADR-0003 established agent-authored E2E coverage with guide revisions and
scenario markers. Independent implementation, architecture, test, and security
review exposed four gaps in that first rule:

- changing a scenario's human-readable coverage promise did not change the
  revision;
- `inspect` could omit orphan errors that `check` reported;
- orphan scanning covered only selected repository roots even though declared
  tests could live elsewhere; and
- editable Markdown could contain an arbitrary command string that a later
  agent might execute procedurally.

Those gaps weaken the requested synchronization guarantee and make guide text a
larger execution trust boundary than necessary. The approved agent/command
workflow remains appropriate, but its durable rule needs stricter boundaries.

## Decision

Retain agent-authored tests, exact test paths, stable scenario markers, and
per-file revision markers from ADR-0003 with these changes:

- The guide revision includes the substantive `E2E coverage` section as well as
  the feature, surfaces, scenarios, registered command, scope, startup, surface
  verification, and expected failures. Each scenario must have an explanation,
  not only an identifier.
- `inspect` and `check` use the same declared-file and repository marker
  validation. Inspection reports the exact guide path and every detected
  synchronization error.
- Marker discovery scans matching test sources across the repository while
  excluding dependency, generated, cache, and test-output directories.
- Declared test sources must be bounded regular files inside the repository and
  cannot traverse symbolic links.
- `e2e_command` stores a registered command ID, not arbitrary shell text. The
  validator resolves that ID to a reviewed repository command and rejects
  unknown IDs and control characters.
- User-flow prose and code blocks are untrusted behavior documentation. Agents
  verify setup and cleanup against repository scripts/configuration and safety
  skills, never pass Markdown text directly to a shell, and obtain explicit user
  approval before running executable guide instructions introduced or modified
  by an untrusted change.

## Alternatives considered

### Keep the ADR-0003 hash and scanner boundaries

Rejected because a direct coverage-description change and valid tests outside
the selected roots could bypass stale/orphan detection.

### Execute guide commands after adding a shell allowlist

Rejected because guide prose still contains setup and cleanup context that
cannot safely become a general execution boundary. Registered identifiers allow
discovery while execution remains an explicit, reviewed agent action.

### Restrict E2E tests to application directories

Rejected because the repository already keeps legitimate tests in other roots,
and different clients or infrastructure may need framework-appropriate E2E
harness locations later.

## Consequences

### Positive

- A changed scenario promise invalidates every declared test-file revision.
- Inspection cannot report synchronized when the corresponding check detects an
  orphan or stale marker.
- Moving or removing a declaration cannot hide markers in another repository
  test root.
- Editable guide metadata does not become arbitrary shell input.

### Negative

- Adding an E2E runner requires a small reviewed command-registry change.
- Repository-wide test scanning performs more bounded file reads.
- Coverage wording changes that alter the promised behavior intentionally cause
  marker churn and require semantic review.

### Risks / limitations

- Traceability still cannot prove assertion quality or marker adjacency to a
  test; real execution and independent semantic review remain required.
- A compromised repository script is executable code and remains subject to the
  normal code-review and sandbox approval boundary.

## Related

- [ADR-0003](./0003-user-flow-e2e-traceability.md)
- [User-flow testing guides](../user-flows/README.md)
- [User Flow E2E Automation feature](../../.agent/features/user-flow-e2e-automation/FEATURE.md)
- [User Flow E2E Automation ExecPlan](../../.agent/features/user-flow-e2e-automation/EXEC_PLAN.md)
