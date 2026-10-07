# Design handoff: Sentence library management and preparation

Owning [feature](./FEATURE.md), [execution plan](./EXEC_PLAN.md),
[implementation plan](../../../docs/sentence-library-implementation-plan.md) and
[version rules](../../DESIGN_HANDOFF.md).

Backend readiness was independently reviewed before these briefs were saved.
The user returned the learner design on 2026-10-07 and authorized local admin
composition. Frontend implementation is resumed; existing practice design
revisions are preserved.

## sentence-library-and-preparation

- Latest candidate: v001.
- Implementation target: v001 — user selected returned learner design, 2026-10-07.
- Last implemented: v001 — 2026-10-07.

### v001 — 2026-10-06

- Status: Awaiting generated design.
- Scope: Dictionary sentence library and optional preparation, including loading, empty/error, access, retention,
  confirmation and recovery states, responsive layouts and accessibility.
- Canonical document: [sentence-library-and-preparation.md](../../../docs/design-prompt/sentence-library-and-preparation.md).
- Frozen exact portable prompt: [v001.prompt.md](./designs/sentence-library-and-preparation/v001.prompt.md).
- Portable prompt SHA-256: `2502df1b412f047b451cb5a6a29bb7f03c0ef4b217567fb61f195c0bc3bf2995`.
- Canonical Markdown SHA-256: `d0f47f56a7f608f84f6a382cd697e1a56171288f1d18746c948d050eeba38c60`.
- Snapshot contains exactly the copyable brief after the canonical document's
  metadata/navigation preamble; no generated design or source export yet exists.
- Source state: verified working tree on `feature/sentence-library-management`,
  baseline `cb9f3ed9d96a95ac606d1089b10e81ab0f1c2384`.
- Backend source SHA-256: `c5c68d99e2d2b8439fb383b2857efe45c28ddfea7261b16031d04bdf6aba670d`; [file manifest](./evidence/backend-manifest.json).
- Generated-design URL: https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4
- Provider revision, exports, captures and design/source hash: not available yet.
- Visual reference: existing selected practice design for the learner brief;
  existing runtime Ant Design/Refine conventions for the admin brief.
- Decision: save the verified brief; select no implementation target until the
  returned design is inventoried. No frontend or pixel-fidelity claim is made.

### Learner v001 returned-source attachment — 2026-10-07

- Status: Implemented and verified — 2026-10-07.
- Provider artifact: `e4a89692-97c6-4fc0-8967-9ca6e8ecc40b`.
- Retained source: [source manifest](./designs/sentence-library-and-preparation/v001/source-manifest.json).
- Manifest SHA-256: `03011dfd23f3cf6e93a30076d0de4de2a1fe67e58a86ea4bb8ce654960b7a5b7`.
- User request explicitly selects the current `/sentences` design for integration.
- Actual provider generation prompt is unknown; the frozen brief records the
  repository requirements, not a claim about the exact provider invocation.
- Scope mapping and justified contract adaptations: FEATURE LIB-01–LIB-06 and
  PREP-01–PREP-03. Empty provider primitive files are unavailable; existing app
  primitives and inspected runtime tokens supply their production contracts.
- Source-based fidelity can be checked against retained classes/hierarchy;
  no reference/runtime pixel comparison is claimed yet.

## admin-sentence-library-management

- Latest candidate: v001.
- Implementation target: local composition of v001 scope — user authorization 2026-10-07.
- Last implemented: v001 — 2026-10-07.

2026-10-07 decision: the user explicitly authorized local responsive admin
design. The frozen brief remains the scope reference; compose the implementation
with Ant Design/Refine runtime conventions. No external admin artifact or pixel
fidelity to one is claimed. Local composition is the selected implementation
target; the original awaiting-design checkpoint below remains historical.

### v001 — 2026-10-06

- Status: Awaiting generated design.
- Scope: Per-user administrative sentence management, including loading, empty/error, access, retention,
  confirmation and recovery states, responsive layouts and accessibility.
- Canonical document: [admin-sentence-library-management.md](../../../docs/design-prompt/admin-sentence-library-management.md).
- Frozen exact portable prompt: [v001.prompt.md](./designs/admin-sentence-library-management/v001.prompt.md).
- Portable prompt SHA-256: `67db3cea1804da5ff56c19af7ac45c58391363bc7365308c3a6dc04ca1fa36be`.
- Canonical Markdown SHA-256: `db78c1072d6eb3eed92e41f5eb411d4031943e0f5dd793d42bb8b3787347edbe`.
- Snapshot contains exactly the copyable brief after the canonical document's
  metadata/navigation preamble; no generated design or source export yet exists.
- Source state: verified working tree on `feature/sentence-library-management`,
  baseline `cb9f3ed9d96a95ac606d1089b10e81ab0f1c2384`.
- Backend source SHA-256: `c5c68d99e2d2b8439fb383b2857efe45c28ddfea7261b16031d04bdf6aba670d`; [file manifest](./evidence/backend-manifest.json).
- Generated-design URL: None — awaiting user.
- Provider revision, exports, captures and design/source hash: not available yet.
- Visual reference: existing selected practice design for the learner brief;
  existing runtime Ant Design/Refine conventions for the admin brief.
- Decision: save the verified brief; select no implementation target until the
  returned design is inventoried. No frontend or pixel-fidelity claim is made.

## Implemented design evidence — 2026-10-07

Learner v001 source integration is implemented; [fidelity inventory](./designs/sentence-library-and-preparation/v001/evidence/FIDELITY.md)
links source sections, runtime captures and contract adaptations. All source
manifest file hashes remain unchanged. Source-based fidelity is assessed;
provider reference screenshots were unavailable, so no pixel-perfect claim.
Admin v001 locally composed scope is implemented; [composition evidence](./designs/admin-sentence-library-management/v001/evidence/COMPOSITION.md)
records themed desktop/mobile layouts and guarded controls. Historical
awaiting-design decisions above are retained as the backend checkpoint history.
