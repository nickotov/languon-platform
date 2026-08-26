# Architecture Decision Records

Architecture Decision Records (ADRs) preserve the reasoning behind durable
technical choices. Architecture documentation describes the system's current
shape; ADRs explain why important choices were made and which alternatives were
rejected.

Agents and developers must follow the ADR policy in the root
[`AGENTS.md`](../../AGENTS.md). In particular, accepted ADRs are architectural
constraints, while feature-local decisions belong in the feature's
`EXEC_PLAN.md`.

## Index

| ADR                                                             | Decision                                  | Status                 |
| --------------------------------------------------------------- | ----------------------------------------- | ---------------------- |
| [ADR-0001](./0001-user-authentication-and-session-strategy.md)  | User authentication and session strategy  | Accepted               |
| [ADR-0002](./0002-drizzle-schema-and-migration-strategy.md)     | Drizzle schema and migration strategy     | Accepted               |
| [ADR-0003](./0003-user-flow-e2e-traceability.md)                | User-flow E2E traceability                | Superseded by ADR-0004 |
| [ADR-0004](./0004-user-flow-e2e-traceability-hardening.md)      | User-flow E2E traceability hardening      | Accepted               |
| [ADR-0005](./0005-frontend-component-and-fsd-standards.md)      | Frontend component and FSD standards      | Accepted               |
| [ADR-0006](./0006-web-internationalization-strategy.md)         | Web internationalization strategy         | Superseded by ADR-0007 |
| [ADR-0007](./0007-web-request-locale-strategy.md)               | Web request locale strategy               | Accepted               |
| [ADR-0008](./0008-web-ui-kit-and-design-source-authority.md)    | Web UI kit and design-source authority    | Superseded by ADR-0016 |
| [ADR-0009](./0009-release-and-deployment-platform.md)           | Release and deployment platform           | Accepted               |
| [ADR-0010](./0010-admin-application-and-authorization.md)       | Admin application and authorization       | Accepted               |
| [ADR-0011](./0011-dictionary-persistence-and-composition.md)    | Dictionary persistence and composition    | Accepted               |
| [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md)  | Dictionary worker and document ingestion  | Accepted               |
| [ADR-0013](./0013-local-web-dev-command-panel.md)               | Local web dev command panel               | Superseded by ADR-0014 |
| [ADR-0014](./0014-web-dev-panel-local-quick-access-sections.md) | Web dev panel local quick-access sections | Accepted               |
| [ADR-0015](./0015-figma-make-design-trial.md)                   | Figma Make visual-design trial            | Superseded by ADR-0016 |
| [ADR-0016](./0016-runtime-ui-kit-authority.md)                  | Runtime UI kit authority                  | Accepted               |

Add each new ADR here. Scan this index and search the directory for relevant
keywords instead of reading every record by default.

## Naming

Copy [`template.md`](./template.md) to the next unused number:

```text
NNNN-kebab-case-decision-title.md
```

Start with `0001` and never reuse a number, including one belonging to a rejected
or superseded decision.

## Statuses

- `Proposed` — under consideration and not yet binding.
- `Accepted` — the active architectural decision.
- `Rejected` — considered but not selected.
- `Deprecated` — still present but discouraged or awaiting retirement.
- `Superseded by ADR-NNNN` — replaced by a newer ADR.

## Lifecycle

1. Record feature-local choices in `EXEC_PLAN.md`.
2. Create an ADR when a choice establishes a constraint future features must
   respect.
3. Add the ADR to the index and link related plans and documentation.
4. Do not rewrite an accepted record's decision or rationale. Create a new ADR
   to replace it and mark the old one superseded.
5. Keep current architecture documentation aligned with accepted decisions.

Fixes limited to typos, formatting, and broken links do not require a new ADR.
