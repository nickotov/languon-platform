# Review: Knowledge Markdown insertion

## Verdict: PASS

No unresolved material findings. Independent completion reviewer and independent rendering/security reviewer assessed the final implementation; no separate tester was required because existing maintained harnesses and focused deterministic tests establish the bounded behavior.

## Boundary and mode

Initial independent review covered the complete tracked and untracked feature049 patch relative to starting HEAD297aa42, identified by [28-file SHA-256 manifest](verified-source-sha256.json). Remediation review was limited to MD049-R1 parser/real-editor tests and the affected content-preservation invariant; no expanded review was required. Reviewers changed no implementation files.

Reviewed mapping/schema fidelity; unsupported/HTML/unsafe-link/table/limits; prospective plugin-aware complete-document validity; Insert/Append/Replace tracked target/conflict paths; undo isolation; formatted preview and literal fallback through full/inline/conflict/retarget; recovery/Save/sharing evidence; FSD/public exports; runtime screenshots and guide traceability. Existing baseline CSS changes from297aa42 were excluded from the implementation diff and preserved.

## Findings

### MD049-R1 — Medium — Resolved

Location: apps/web/src/fsd/features/knowledge-notes/lib/proposal-markdown.ts, preflight and decoded visibility validation.

Empty headings/list items/link labels could be accepted while producing no meaningful content. Reproducers included `#`, `-`, and `Prefix [&#32;](https://example.com) suffix`. Acceptance could misleadingly report an edit while discarding invisible source/URL without literal fallback.

Remediation: reject empty lexical headings/links and validate decoded heading/list subtrees and contiguous link-label spans. Valid synthetic nested-list tokens and multi-mark labels remain accepted. Focused parser and actual editor tests verify atomic failure, preserved target and explicit literal fallback. Markdown definitions follow documented metadata resolution; no source-roundtrip archive is promised. Independent remediation review confirmed closure.

### SR-049-01 — Medium — Resolved

Location: proposal-markdown.ts quote-depth guard, invoked automatically for completed workspace replies.

The original ambiguous repeated whitespace regex could freeze the browser before acceptance. Independent reproductions took about1.5s at132 chars,3.1s at1,212 chars and exceeded30s within the80k source bound.

Remediation: a linear prefix scanner replaces the regex; adversarial input is covered. Security review confirmed closure and reviewed later decoded-content checks without new findings.

## Security controls and residual risk

HTML/unknown tokens reject before conversion; emitted links and definitions use validated absolute HTTP(S) without credentials; titles/unsupported attributes are removed; plain fallback is text JSON. React and the public renderer never inject HTML, links use noopener/noreferrer, and no remote media/conversion request is introduced. Complete-document validation includes current deterministic trailing-node plugin output before dispatch. No auth, tenant, backend persistence, model-tool, logging or secret boundary changed.

Official package remains beta and parsing is synchronous and bounded. Future nondeterministic or side-effecting appendTransaction plugins need renewed prospective-validation review. Marked reference-definition metadata need not round-trip; original source remains private chat content. No open material security finding remains.

## Evidence disposition

[Evidence](EVIDENCE.md):78 focused tests/9 files, final production build and lint pass, final Markdown real-browser regression plus4 backend tests pass; source manifest has zero mismatches. Earlier final3 browser scenarios cover original-target review/mobile switching; later parser-only rejection changes preserve their valid inputs and full focused suites verify those paths.

Full mapped browser run has10 passes and1 existing1023px overlay containment failure, reproduced on starting297aa42 runtime. Style-check violations are in unchanged files from that baseline. They do not block this scoped feature and are not reported as passing checks.
