# Review: Knowledge workspace

Reviewed: 2026-10-19
Reviewer: Independent completion reviewer and security reviewer
Verdict: Approved after remediation; no material findings remain

## Review boundary

- Mode: Initial complete scoped patch review, then bounded remediation review
  of R-1/R-3 source and R-2 browser/evidence additions.
- Trigger: persistent note state, shared content, private model context and
  cross-application UI paths need independent assessment.
- Reviewed state: branch `feature/knowledge-workspace`, base/HEAD
  `ed2b7b1d9a9490a259197bc7c2ea1af1913da093`, tracked diff plus all
  untracked feature files. Aggregate capture hash
  `65eb1afd929193e24e4bf2696fb61330f427748d0a2d70cb068afd5f7eea555d`
  (94 files at capture). The live tree changed afterward.
- Scope: contracts/migration, Knowledge persistence/API, conversation admission,
  retry/memory/recall, web recovery/conflict/share/editor/chat, tests/docs and
  FSD/DDD boundaries.
- Inputs: FEATURE AC-1–AC-9, EXEC_PLAN, accepted ADR-0042, root/backend/web
  AGENTS, applicable Knowledge/contextual guides and EVIDENCE.
- Separate tester/security review: a tester owns the guarded cross-application
  journey and fixture adequacy. A threat-focused reviewer assessed sharing,
  owner access, copied content, model execution and account erasure.
- Expansion reason, if this is a new broad review:

## Findings

Use stable IDs. Report material defects with evidence; separate optional work.
Use `None` when there are no material findings.

### R-1 — Proposal target was ephemeral

- Severity: High. Location: web assistant send/accept hooks and Knowledge editor
  target map; backend target contract and validator.
- The UI kept only a local target ID and omitted the durable target descriptor
  from the submitted turn. Reload or retry could lose the insertion/replacement
  anchor. Backend validation accepted a matching substring without checking
  offsets or document hash. Impact: AC-8 could apply at the wrong location or
  become unavailable after recovery.
- Disposition: Fixed. Every new workspace turn requires a frozen UTF-16
  offset/hash anchor; backend validates exact text, hash and boundaries,
  persists it on user/assistant messages, and retry retains it. Web rehydrates
  an identical document and conservatively requests comparison otherwise.
  Focused contract/backend/web tests and independent source remediation review
  pass; R-2 tracks final browser proof.

### R-2 — Conflict and proposal browser paths lacked runtime proof

- Severity: Medium. Location: Knowledge workspace mapped E2E coverage.
- The original three new journeys covered draft/reopen, sharing and mobile
  layout, but not two-tab conflict resolution or proposal acceptance/undo.
  AC-3 and AC-8 visible behavior therefore had only lower-layer evidence under
  ADR-0016.
- Disposition: Fixed. Mapped guarded browser journeys now cover two-tab
  conflict/Resolve, restore with an unpublished branch/re-Save, exact 40,000
  reference rejection, persisted proposal reload/replace/Undo/changed-target
  comparison/Append. The final backend suite passed 4/4 and Playwright 10/10.

### R-3 — Revision restore strands unpublished branch

- Severity: High. Location: Knowledge revision restoration transaction and
  workspace conflict presentation.
- Restoring an earlier saved revision while an unpublished working branch
  exists leaves that branch tied to the prior published version. Save then
  returns 409 permanently, while a single branch hides the conflict UI.
  Impact: AC-3 working prose cannot be published or explicitly resolved, and
  AC-9 revision restoration regresses.
- Disposition: Fixed. The restore transaction adds an explicit published
  alternative while retaining the unsaved preferred branch. Save is blocked
  until explicit resolution; full resolution rebases the kept branch. Store
  regression and independent source remediation review pass; R-2 tracks final
  browser proof.

### S-1 — Revoked share read race

- Severity: Medium. Location: `drizzle-knowledge-store.ts` share read/copy lock path.
- A request could read a capability, wait for the note lock, then finish after
  revocation. Impact: AC-5 immediate revocation was violated.
- Disposition: Fixed. The store locks and revalidates the live capability after
  the note lock. Deterministic disposable PostgreSQL race test passes (E-2).

### S-2 — Account deletion cancellation revived old links

- Severity: Medium. Location: account-deletion scheduling transaction.
- A retained capability became usable if deletion was canceled and the owner
  became active again. Impact: previously invalidated saved note became public.
- Disposition: Fixed. Scheduling deletes Knowledge capabilities transactionally;
  integration tests cover cancellation and a newly issued link (E-2).

### S-3 — Attachment kind bypassed reference limit

- Severity: Low. Location: workspace turn context admission.
- Relabeling copied text as a legacy attachment omitted it from the Knowledge
  reference budget. Impact: oversized prompts within other global gates.
- Disposition: Fixed. Every copied body and explicit translation now counts;
  boundary tests pass (E-4).

## Completion audit

- Acceptance criteria and source-design inventory reconciled with implementation
  and valid evidence.
- Material regression/architecture/security risks assessed.
- Applicable guides, mappings, and required verification current.
- No accidental scope, secrets, or temporary/generated artifacts.
- Remaining uncertainty and boundaries of this review explicit.

## Remediation and final verdict

Record batched repairs, which evidence was invalidated/reused, and the scope of
follow-up review. A fix does not automatically require another full review.
Follow `.agent/DELIVERY.md` for recurring-findings diagnosis after two cycles;
never use a cycle count to waive material defects.

Security verdict: no unresolved material security findings after remediation.
Residual deployment assumptions: the configured HMAC secret must remain strong
and stable; reverse proxies must not log the share-key header; model-provider
retention remains an external deployment concern. Initial independent
completion review found R-1, R-2 and R-3 and returned **Changes required**.
Bounded review confirmed all three fixed with no new material finding. AC-1
through AC-9 are adequately evidenced. The reviewer accepted post-format build
9/9, lint/typecheck, scoped formatting, web 761/761, disposable Knowledge 32/32
and Conversations 31/31, focused target 19/19, guide/diagram checks, and final
guarded backend 4/4 plus browser 10/10. The broad backend Vitest command needed
an unavailable default PostgreSQL service; affected suites passed with disposable
PostgreSQL and guarded E2E instead. The narrow retry null-anchor change did not
receive a second 31-test disposable-store run after service shutdown, but its
focused validation, backend typecheck and guarded journeys passed.

Final read-only reviewer verdict: **Approved / Pass** for feature completion and
local squash merge. Capture boundary: branch `feature/knowledge-workspace`, base
`ed2b7b1d9a9490a259197bc7c2ea1af1913da093`, 96 tracked changed paths and
31 untracked feature files. Status-manifest SHA-256
`77e31cae48a96cbff112b6fa5d8d7165aff528fc3eaea3a65558a89bb3b260e1`;
aggregate patch SHA-256
`4488d3d387d6a2e839ba7f1aaeefe16fb54209216007a82ea0b6453695f0c8f6`.
The capture preceded only this verdict and feature bookkeeping. Any later
semantic source or test edit requires review of its delta.
