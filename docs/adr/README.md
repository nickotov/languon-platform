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

| ADR | Decision | Status |
| --- | -------- | ------ |

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
