# Feature workspaces

Create one kebab-case directory per non-trivial feature with
`pnpm feature:new -- <slug> "<title>"`. Each directory contains `FEATURE.md`,
`EXEC_PLAN.md`, `EVIDENCE.md`, and `REVIEW.md`.

Feature artifacts are living engineering state. Update them during the work and
commit them with the implementation. Do not place credentials, raw production
data, or unbounded logs here.
