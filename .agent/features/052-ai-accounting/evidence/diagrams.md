# Feature052 architecture diagram reconciliation

Date: 2026-10-22. Scope: `docs/diagrams/**` and one stale existing diagram E2E title literal. No application behavior, viewer behavior, diagram guide commands, or new journey changed.

## Source reconciliation

- AI lifecycle: replaced obsolete conservative full-hold technical-failure language with source-backed action/attempt admission, independent customer/provider rates, operator budgets, exact settlement, Free interview quota, durable replay and background reporting. Recorded exact participant, capacity, conversation and interview source paths plus accepted ADR-0045.
- Speech: traced speech-accounting authorization, attempt reservation and terminal expense recording in the speech store/helper. Added full-clip operator authorization and separate estimated/unknown provider expense; retained cache/join, conditional exemption and billing-deadline behavior.
- Conversations: compared changed store/accounting/worker/model code. Added quote confirmation, operator-funded memory, 10,000 action output ceiling, explicit-Stop settlement and 100ms/4KiB durable text batching. Existing Knowledge publication/share authority edges remain unchanged.
- Module/system views: compared index route mounts, admin route and public contract exports. Added the in-process accounting responsibility and admin accounting edge; no extra service/broker was invented.
- Development view: index now starts report refresh and bounded maintenance on dedicated single-connection clients. Added those edges and fresh-ledger cutover note. Deployment tooling remains the same image/process topology.
- Dictionaries/learning: inspected changed generation store and sentence worker store against existing proposal/publication rules; those ownership edges remain. Added a narrow sourced note linking new shared financial semantics.
- Texts/vocabulary: inspected Texts job and selection stores with shared legacy-action helper; Save/Add authority topology remains. Added exact newly relevant sources and a narrow settlement note.
- Authentication view: recorded inputs unchanged; no semantic content change. The catalog stamp command updates every reviewed date, including this unchanged view; its unchanged fingerprint does not claim new authentication work.

Discovery used bounded exact-file reads and scoped text searches; no semantic-tool claim is made. Diagram fingerprints establish recorded source freshness, not exhaustive runtime conformance or measured accounting performance.

## Checks and rendered evidence

- `pnpm diagrams:check -- --stamp`: all nine diagrams valid and fresh after reconciliation, with root confirming source freeze.
- `pnpm test:e2e:diagrams`: **2 passed (3.8s)**. Maintained Chromium journey renders every real diagram and checks fresh status, source inspection, navigation, keyboard focus, desktop1440×1000/mobile390×844 containment, no console errors, failed requests or external requests. Recovery journey covers source drift plus expected controlled render/network failures.
- First run exposed a pre-existing stale assertion for `Conversations and independent Knowledge`; aligned that one literal with the existing canonical title `Conversations and Knowledge workspace`. No viewer content was renamed to satisfy a test.
- Additional safe-wrapper session `languon-accounting-diagrams-b53bd02a980fcdc0b2feabf949094ea7`, reviewed local viewer `http://127.0.0.1:4401`, headless Chromium. Observed accounting flow at desktop1440×1000, Fit and zoom113%; speech flow at390×844. Labels render without overlap at readable zoom; long vertical graphs intentionally require the existing zoom/scroll controls. Narrow layout preserves controls and selection. `errors` and `console` empty; captured requests were local successful200/204. Session closed after inspection.
- Screenshots: `diagram-accounting-fit-desktop.png`, `diagram-accounting-detail-desktop.png`, `diagram-speech-mobile.png` in this folder.
- `pnpm diagrams:check`: all nine current after browser verification.

## Final recorded fingerprints

- `docs/diagrams/ai-job-lifecycle.md`: `sha256:59bbd2cdcc9b5798ee96c6cbb09b7d47c1b7b4eb9368730095653369afdd714d`
- `docs/diagrams/authentication.md`: `sha256:f4b71748222606e68f29eda716500cbb8972c2768168eca7397e5c1986305ede`
- `docs/diagrams/conversations-and-knowledge.md`: `sha256:375eb01d5446d14b523a68f46edc133addc028e2cad0ef3faaeef292fcfa3828`
- `docs/diagrams/development-and-deployment.md`: `sha256:42514457082310d09540b96d1df585c429ea993e64cc3af2dc1d17a94c618c45`
- `docs/diagrams/dictionaries-and-learning.md`: `sha256:3b35b7f7273f8188ad9c0b598071b00bec6f4df9efe3c40580ae8c2b61953ef2`
- `docs/diagrams/module-boundaries.md`: `sha256:221210ca844f26cdebb4b232118a84b148b83546d2ba77d3277e6e2633fbd533`
- `docs/diagrams/speech-and-pricing.md`: `sha256:abb1beed66dfe09e18a9ff03f221bba3fb12dbe8017e0985c0982d9fe3690980`
- `docs/diagrams/system-context.md`: `sha256:4fb5dd139be624c7cdb779472d06fba9972f661e4bd004b7999a70aeae070d24`
- `docs/diagrams/texts-and-vocabulary.md`: `sha256:122f98b6ebbf466b58c389f021f40a41660310d8775ec3b3dc79ef6c3bca9d34`

Later source changes require comparison and a new fingerprint; do not blindly restamp. No paid provider calls or database tests were used for this diagram task.

## Final narrow source reconciliation (after formatting and progress isolation)

Compared final source changes after the first rendered run. ADR-0045 adds an operations
link; formatting changes do not change the other views' topology. The real additional
changes are now represented explicitly:

- Dictionary composition empties new enqueued formats and OCR availability when credit
  enforcement is off; existing read/Accept/cancel/drain remain available. Removed the
  misleading current fixture-bypass edge. Retained store legacy handling is historical,
  not a live public admission bypass. Deterministic fixtures use accounted admission.
- Conversation private append/heartbeat use a progress transaction with actor SHARE,
  current source/chat/turn/lease/Stop checks, skipping global capacity. Public arbitrary
  withOperation plus admission/settlement retain global mutation and actor UPDATE fences.
  Added the exact source resolver input and notes without weakening the authority graph.

`pnpm diagrams:check -- --stamp` and `pnpm diagrams:check` pass all nine after this
comparison. Browser rerun is pending the root's quiet load-test terminal; earlier browser
evidence proves the previous core graph and is not claimed as final changed-Mermaid evidence.

Final reconciled fingerprints (supersede the earlier list):

- `docs/diagrams/ai-job-lifecycle.md`: `sha256:8792ecf72a142b1fc6badf279547c91d5199e3c3cfd890e58d73fdd08e6eca16`
- `docs/diagrams/authentication.md`: `sha256:f4b71748222606e68f29eda716500cbb8972c2768168eca7397e5c1986305ede`
- `docs/diagrams/conversations-and-knowledge.md`: `sha256:437b878d04667e1054745e0b7d35b014c5d81eb64e4d126a963823cc9c7dbbea`
- `docs/diagrams/development-and-deployment.md`: `sha256:5fd5f5195c3bf042cba39319b10772da9ffbe85144fdd408da76ed573f3881ba`
- `docs/diagrams/dictionaries-and-learning.md`: `sha256:7c958a08f687dd00cc06db80537fde004f8d69d77dd2452c1fc9e60b3b76f1c1`
- `docs/diagrams/module-boundaries.md`: `sha256:764118b8f0d27b78f195e9c8f7bbd5592450f71e317ab9171788eda2409090de`
- `docs/diagrams/speech-and-pricing.md`: `sha256:ffa99ccdedc6aafae1c56d51a557b5d2f8c5cfd8325619e8e56d86c4e2e9b73f`
- `docs/diagrams/system-context.md`: `sha256:e4ee0839440da14847f9c2b2c5a981bd8ce7017f0cc4aacf54e0fb955b2b67f5`
- `docs/diagrams/texts-and-vocabulary.md`: `sha256:f8f6dfae7c6ba6125f8aaf1ddd942b13d135ba07b421c6d00916727bd9c18de9`

## Checkpoint9 security/consent/preparation reconciliation

Reviewed the current FEATURE and checkpoint9, then traced the final source seams rather
than broadening the atlas. Existing views now include generic paid allowance consent,
first-admission/profile atomic default copy, one preparation parent hold/pins/shared10k
output and five-call allowance with fenced children and explicit Continue, checked worker
SQL dispatch/settlement, provenance-derived expense facts, and claim/fence-scoped financial
purge/recovery. The speech view also labels checked live-lease dispatch. Added exact
implementation SQL, preparation/default/consent helpers and restricted role files as source
inputs. No Kafka/service/extra diagram taxonomy, domain purge redesign, app UI or database
work was introduced.

The previous source snapshot was compared for material flow changes; other changed
recorded bytes preserve their established topology. Final Mermaid syntax/stamp checks
pass all nine. Final browser rerun pending root coordination before quiet load.

Checkpoint9 reconciled fingerprints (supersede previous lists):

- `docs/diagrams/ai-job-lifecycle.md`: `sha256:fec8569689ca090296a62e3b56dae10daef04ebeaa976c7b1fb9f8d14e74b52e`
- `docs/diagrams/authentication.md`: `sha256:f4b71748222606e68f29eda716500cbb8972c2768168eca7397e5c1986305ede`
- `docs/diagrams/conversations-and-knowledge.md`: `sha256:02910cd38224bef7b1e25ec2c225bdd94b007fa2dbb4cb8ed1d9eca33b526784`
- `docs/diagrams/development-and-deployment.md`: `sha256:c12dd6224dda562da927c9611a75cb8587986f80cd5d064ee6a02f622a7d1432`
- `docs/diagrams/dictionaries-and-learning.md`: `sha256:9694b1466b30866af2e31487b58f2a065d3aebdf8a4937a91c65ea7f37cb43ce`
- `docs/diagrams/module-boundaries.md`: `sha256:e584bc9c34366bf54cfedbb70344c4d808607e8179cc83d2f01c77d81dd0b0c9`
- `docs/diagrams/speech-and-pricing.md`: `sha256:4989eb6a1160490c30d0d6feecab5146c6605a99ff20615019fc89bfe930c9c1`
- `docs/diagrams/system-context.md`: `sha256:da03b0aa733277bce28c341eb977f77d0e7dc8c85f6f3051ac1d2fc7aac41a37`
- `docs/diagrams/texts-and-vocabulary.md`: `sha256:cece3fd4b09ca3c02648b83c5569965549dc6e7be05ec92645f840be18a4d5f1`

Final checkpoint9 rendered verification: `pnpm test:e2e:diagrams` **exit0, 2 passed
(3.5s)** on the final reconciled source snapshot. The maintained Chromium suite rendered
all nine real diagrams with fresh metadata and no console errors, failed requests or
external requests; source inspection/navigation/desktop1440×1000/mobile390×844 and
controlled drift/render/network recovery passed. Playwright owned the isolated viewer
at127.0.0.1:4412 and stopped it on exit. No application servers, database fixtures or paid
provider calls were used. Earlier screenshots are retained as historical visual evidence,
not screenshots of the final additional branch labels. Final freshness check passes all
nine. Required changed-Mermaid real-browser evidence is the final maintained suite run.
