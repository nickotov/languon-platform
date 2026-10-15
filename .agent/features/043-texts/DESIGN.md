# Design handoff: Texts

Owning [feature](FEATURE.md), [execution plan](EXEC_PLAN.md),
[evidence](EVIDENCE.md) and [handoff rules](../../DESIGN_HANDOFF.md).

Backend checkpoint verified and independently reviewed on 2026-10-15.
User returned the selected Magic Patterns Texts/related-components design on
2026-10-15. The v003 direct component source was retrieved, integrated, verified and
independently approved on 2026-10-16.

## texts

- Latest candidate: v003.
- Implementation target: v003 — directly readable user-selected Texts design.
- Last implemented: v003 — verified 2026-10-16.

### v001 — 2026-10-15

- Status: Superseded candidate — see v002.
- Scope: responsive web Texts folders, whole-text translation, aligned reading,
  explicit editing, contextual vocabulary collection, unlisted sharing/copy,
  lifecycle and complete recovery states. No frontend implementation yet.
- Canonical document: [texts.md](../../../docs/design-prompt/texts.md).
- Immutable complete canonical snapshot: [v001.prompt.md](designs/texts/v001.prompt.md).
- Canonical and snapshot SHA-256: `50810eeaf0b32c285637c154671726e1c4a2dfa4677e15c4db2d01ab89f76896`.
- Snapshot includes full metadata, portable prompt, checklist TXT-01–TXT-28,
  source grounding and limitations; copy only its Portable Magic Patterns prompt
  section when generating. The canonical document links back to this handoff.
- Source state: verified working tree on `feature/texts`, baseline
  `664198fee9eb1a0492134c43de9a9d04835568af`.
- Backend source manifest: [backend-verified.sha256](backend-verified.sha256).
- Manifest SHA-256: `afa35be15d878b4bd4c617159ef9b45807ff1fee6a7522fb55189da54faa2e0c`.
- Backend evidence: [EVIDENCE.md](EVIDENCE.md); independent correctness and
  security findings resolved in [REVIEW.md](REVIEW.md).
- Design reference: existing Languon Magic Patterns project/runtime shell;
  no new visual reference URL supplied. Existing runtime tokens/primitives and
  dictionary screens were inspected for source grounding.
- Generated-design URL: not yet provided.
- Provider revision/artifact/export/source/captures: not yet provided.
- Browser/design fidelity: not assessed; no Texts UI exists yet.
- Decision: preserve this candidate; implementation target remains none until
  the user returns/selects a design. A prompt update becomes v002; do not overwrite
  this snapshot. Attach returned exports/source/captures to this candidate using
  versioned handoff rules before frontend work.

### v002 — 2026-10-15

- Status: Selected by user; generated source access pending.
- Scope: same complete Texts scope as v001; final contract check explicitly limits
  existing dictionary choices to the selected occurrence's language direction.
- Reason: make the server-enforced matching-language rule visible in the picker
  rather than leaving an incompatible choice to fail during collection.
- Canonical document: [texts.md](../../../docs/design-prompt/texts.md).
- Immutable complete canonical snapshot: [v002.prompt.md](designs/texts/v002.prompt.md).
- Canonical and snapshot SHA-256: `093fe7e224bde2764dd26f786a297c465b9259e746343677524f96f121325c64`.
- Backend/source state and verified manifest: unchanged from v001 above.
- Generated-design URL: supplied by user; see Returned design below. Provider
  revision/export/source/captures are not yet available.
- Implementation target: none. Last implemented: none.
- Decision: v002 is the latest candidate to send to Magic Patterns. Preserve v001
  history. Wait for returned design; no frontend implementation or fidelity claim.

## Returned design — 2026-10-15

- Selected scope: “component texts and related to it.”
- User-supplied URL: https://www.magicpatterns.com/os/gmuxzN8Bz4uLiDf4XJFGvr/a4xd5p5FYukX748UesMKV8
- Associated requirement/prompt candidate: v002. The exact prompt used in the
  provider is not independently confirmed; original v001/v002 snapshots preserved.
- Access evidence: connector resolver rejects `/os/` URLs; treating the two IDs as
  legacy `/c/` editor IDs returns design/room not found. Public page is the app
  loader without component source. The connector's Languon design-system artifact
  has no Texts component and is not treated as this design's source.
- Visible Chrome Texts design window was identified. Orca GUI inspection is
  unavailable because macOS Accessibility permission is not granted. No Texts
  visual inventory, source snapshot or reference captures exist yet.
- Requested the underlying direct component/preview link asynchronously. Do not
  reconstruct a design from the prompt or claim source/runtime fidelity meanwhile.
- Safe independent work: typed frontend API adapter and contract tests. No visual
  Texts UI implementation until source can be inspected. Implementation target is
  selected; last implemented remains none. Provider version, actual source hash,
  immutable export and captures must be attached here before fidelity integration.

## Replacement component link — 2026-10-15

- Current user-selected component URL:
  https://www.magicpatterns.com/os/gmuxzN8Bz4uLiDf4XJFGvr/hEpH1MriKEKQaMUFkvRxLA
- User explicitly requested retrying Magic Patterns MCP and adapting this UI.
  This supersedes the earlier component locator; prompt requirement candidate
  v002 remains unchanged and its frozen snapshots are preserved.
- Fresh MCP results: `/os/` resolver rejects format; direct component
  `get_design_status`, `get_artifact`, `list_version_history` and recent message
  history all return “Room not found.” Legacy `/c/` resolver only echoes the ID;
  it does not resolve an accessible artifact. Canvas lookup returns not found.
- Fresh Languon design-system lookup still resolves artifact
  `ecb75ac2-c06e-44ed-8e1b-28ec4bff5287`; complete file listing has primitives and
  design rules, no Texts/related screens. It is not substituted for the chosen UI.
- GUI fallback: permission status now reports Accessibility/screenshots granted,
  but actual targeted `get-app-state` still returns `permission_denied`, including
  one retry after launching the helper via its permission setup command. No
  screenshot/tree/source was obtained. Do not claim GUI source access succeeded.
- Result: no component source, export, revision hash or fidelity inventory yet;
  no UI adaptation can be verified. Existing backend/API work remains intact.
  Need readable direct preview/design or code export to continue visual integration.

### Retry after user increased access

- User reported increasing access and requested a fresh retry of the same hEpH
  component. Fresh MCP URL/status/artifact calls still return unsupported format/
  room not found. Direct artifact read also returns design not found. No code was
  extracted and no permissions claim is inferred from the user's change alone.
- Chrome's scoped scripting interface can identify the workspace tab, but page
  JavaScript is disabled by browser policy. Saving that exact workspace as HTML
  produced only its app loader, not React component source or rendered Texts UI.
  Temporary loader remains outside the repository; it is not design evidence.
- Orca permission status still says granted while actual targeted observation
  fails. No browser security settings were changed. Further visual implementation
  requires an accessible source export; the existing backend/API remain verified.

## v003 — directly readable selected design

- Status: Implemented — verified 2026-10-16.
- User explicitly selected https://www.magicpatterns.com/c/3bkwp6aroumx9kbdrfpju5
  and requires all buttons/icons/content/layout, authorizing small UI-kit changes.
- Editor ID: `3bkwp6aroumx9kbdrfpju5`.
- Pinned active artifact: `1d26e57d-ae12-4537-8e01-45e75e40456b` (not generating).
- Immutable exact MCP source: [v003/source](designs/texts/v003/source).
- Per-file hashes/byte sizes and access limitation:
  [source-manifest.json](designs/texts/v003/source-manifest.json).
  82 returned source entries: 64 nonempty; 18 inherited design-system primitive
  placeholders returned empty, not treated as source. Existing app primitives
  remain authoritative for those mechanisms. Parent screen source is complete.
- Prompt requirement reference: v002; no claim that its exact text was used by
  the provider. v001/v002 prompt snapshots remain unchanged.
- In-scope inventory: FEATURE.md UI-01–UI-40; integration decisions D5–D8.
- Reference-image access: public OG image inspected and confirmed generic branding;
  it is not a design screenshot. Source-to-runtime verification uses supplied
  markup/style/state contracts and real rendered browser evidence. Do not claim
  screenshot pixel matching without a reference image.
- Existing unavailable OS candidates remain historical and are not the target.
- Last implemented: v003; runtime evidence and independent reviews are recorded
  in EVIDENCE.md and REVIEW.md.

### v003 completion — 2026-10-16

Implemented and independently reviewed; all material controls, icons and states
are accounted for by FEATURE.md UI-01–UI-40 and decisions D5–D8. The immutable
source export remains byte exact. Runtime evidence includes desktop paragraph
reading/edit markers/contextual card and phone reading/counterpart/dictionary
collection at390/320px, plus manual dark folder dialogs. Capture identities:

```text
06dd876f6f41b79651bc6ce7e256a1eec4114c5052bba2e0d8a095044c5d5aed  runtime-contextual-bank-card-desktop.png
a3db10d8e6663b48bb7305141a850830e5766d5fc126a62ac6ec333ee035b7a6  runtime-dark-folder-desktop.png
da661c187c0f964f8a59f6fec3ae8f866cb1bbacf3d506d3f5af3c6bb7ae1e26  runtime-dark-folder-phone.png
01b6aaf50f7b9f7b242f325695c405759c4f7db2c66c466195f2eb5035a51cbc  runtime-workspace-counterpart-phone.png
5dd141d984e61193025c390a49b7069e2e24b4d1ca0b16f0f47cdfb4bd884b06  runtime-workspace-edited-paragraphs-desktop.png
3b3d7e919d53136411033cfa63adebd8e5e3169a1b485cb2a6f51b272b5ef85f  runtime-workspace-new-dictionary-phone.png
c813e107e85e9601bdea74adfdea2abcc2b8ae2f6d3db8017897420057639892  runtime-workspace-reading-desktop.png
625280cda8b87d28b8cf81a53fba9ef3fc2757434e807ffa66937afbf533668d  runtime-workspace-reading-phone-320.png
802f04645098e9dda0f4cc4da00df3f6d42a2c03f373e937c6e3ee41341d2525  runtime-workspace-reading-phone.png
```

Final code identity: ui-preflight.sha256 (227 files), SHA-256
`3894b0517afc36d9d4e47d748ab2fed4b9adbd264ffe12402dbb850df5f76fea`.
This is source-to-runtime design verification; absent provider reference images
and empty inherited primitive source prevent a screenshot pixel-match claim.

Verified implementation source commit: `c6aa380a62260242a454d775dc782dd78cd82b13` on `feature/texts`.
The feature is delivered through the required local squash integration into main.
