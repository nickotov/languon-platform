# Review: Flashcard training web design integration

Status: Passed
Updated: 2026-10-02

## Initial completion review

Independent reviewer /root/flashcard_completion_review, INITIAL whole scoped
tracked/untracked patch from base d7390af209ee29d4394a81e3c59e532d01295bb5.
Tracked patch SHA-256 ca537bbf0e175c348af8826a6f7955db75c61bfcba150363e77aa082fa07e851;
untracked content-list SHA-256 697f4b8d445d00a29fa0aa239c0f63a3f2d2f4ef3e943f9f7491f25211b55017.
Verdict: changes requested; no critical/high findings. Valid existing evidence
reused rather than duplicated; no other material architecture/performance defect.

| ID         | Severity / location               | Problem and impact                                                                                 | Disposition / required proof                                                                               |
| ---------- | --------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| F034-CR-01 | Medium, session-writer.ts:166     | Rejected rating B clears previous successful A lastAck; Undo lost after content recovery (AC-5).   | Accepted; preserve prior ACK and two-card conflict/reload/Undo regression.                                 |
| F034-CR-02 | Medium, training-launcher.tsx:141 | Capability false hides complete Train, unlike source which omits only Cards (AC-1/UI-01).          | Accepted; retain menu/Sentences, omit Cards; disabled-capability regression.                               |
| F034-CR-03 | Medium, implementation plan:321   | Required real-browser 200% zoom/long RTL/reduced-motion/touch proof absent (AC-4/8).               | Accepted; repeatable real-browser accessibility journey and retained captures; state exact zoom mechanism. |
| F034-CR-04 | Medium, setup tests/E2E           | Set-only test does not prove search debounce/cursor/pages/accumulated selection into Start (AC-2). | Accepted; focused hook/component regression covering full path; correct evidence wording.                  |

## Initial security review

Independent /root/flashcard_security_review; scoped runtime/test fingerprint
f48d1cea1faaacc5a9d81bd8350d98c11078d2aeda3e507b25d0817ee02443ec.
Verdict: no material security findings. Checked request-boundary validation,
auth refresh without anonymous downgrade, shared-key header-only transport,
identity/access cleanup and late-response suppression, local anonymous writes,
parameterized search, plain-text rendering, narrowed CORS ownership and shared
Menu text rendering. Reused composed journey evidence; no implementation edits.
Feature033 persistence/purge/production rollout are outside this review.

Residual: client-held fragment capabilities are readable by browser compromise/
extensions (existing threat boundary); no new exposure added. Final evidence must
be bound to tested source hash. Broader dictionary initial failures were closed
by scoped selector correction and fresh-run-ID 2/2 rerun (EVIDENCE.md).

## Remediation review

All four findings closed by focused independent remediation review. Prior ACK
survives rejected later ratings; disabled capability retains Train/Sentences;
manual paging/search/Start coverage is complete. The inner scrolling face now
owns pan-y, with vertical/no-rate and horizontal/rate proven through native CDP
in the final four passing journeys. Long RTL/reduced motion and documented
CSS-scale content surrogate plus real 720×500 controls close R3. Native browser
chrome zoom is not claimed; the reviewer accepts that proportional limitation.

Final verdict: Pass, no unresolved material findings. Evidence and cleanup are
current in EVIDENCE.md; runtime manifest SHA-256
`67fde3eff2a2d23030899e98195929ff2e3d6c24f8d8cdc6675129c0c3cbf11a`.
Security focused remediation also passes: fingerprint
`4f776c1f14bf302d3066e850c0a107454724bf1b6030e4745d61429cf222766c`.
No new auth/rendering/transport/CORS trust boundary was introduced by the later
gesture-only class fix. Generated builds/declarations are excluded/restored.
