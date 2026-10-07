---
type: backlog-task
id: BL-010
title: Saved sentence management and full-dictionary preparation
status: done
created: 2026-10-06
updated: 2026-10-07
original_tasks: user-request-2026-10-06
evidence:
    - .agent/features/039-sentence-library-management/EVIDENCE.md
---

# BL-010 — Saved sentence management and full-dictionary preparation

[Backlog index](INDEX.md) · [Plan](../sentence-library-implementation-plan.md)

User-authorized extension: per-user reversible sentence archive/restore and read-only
preview; admin per-user/global management and creator-archived-only permanent deletion;
optional full-dictionary background preparation with partial start/resume and existing
credit/capacity bounds. No manual content editing (BL-007 remains pending).
Backend-first verification and separate web/admin prompts were followed by the
returned learner design and authorized local admin composition. [Feature039](../../.agent/features/039-sentence-library-management/FEATURE.md)
owns acceptance and execution/evidence/review. BL-004 remains Done.

## Backend/design checkpoint — 2026-10-06

Backend APIs, persistence, preparation, erasure and administrative authorization
are verified and independently reviewed. New controls await returned designs;
this task remains In progress. Copy the [learner prompt](../design-prompt/sentence-library-and-preparation.md)
and [admin prompt](../design-prompt/admin-sentence-library-management.md).
Their [versioned handoff](../../.agent/features/039-sentence-library-management/DESIGN.md)
preserves exact v001 briefs and selects no frontend implementation target yet.

## Returned-design implementation — 2026-10-07

The user selected the returned learner design and authorized responsive local
admin design. Web/admin controls are implemented; final browser proof and
completion review remain in progress. The versioned handoff records the selected
provider artifact and retained source. This task remains In progress until the
whole-feature Definition of Done is met.

## Verified completion — 2026-10-07

Returned learner design and responsive local admin composition are implemented
and verified. Final learner 9/9, admin 9/9 and owner flashcard 1/1 browser
journeys pass alongside affected unit/static/build/guide checks. Independent
completion/security review approves the feature; evidence above records the
source fidelity limitations and accepted low worker hardening residual. BL-010
is Done. BL-007 manual content editing remains pending.
