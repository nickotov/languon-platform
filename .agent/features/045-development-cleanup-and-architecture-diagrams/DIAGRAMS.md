# Diagram source reconciliation

Scope: FEATURE.md AC-3/AC-4; authored 2026-10-19 with the newly created
`.agents/skills/architecture-diagrams/SKILL.md` and efficient-code-search workflow.

## Reviewed views

Nine focused Mermaid views under `docs/diagrams`, with a single frontmatter-owned
catalog, exact selected input files and aggregate SHA256 fingerprints. The README
explains the byte-level algorithm and the limits of hash evidence.

| View                        | Implementation evidence / material branches                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| system-context              | HTTP and worker composition roots; browser proxy configuration; PostgreSQL/Redis composition; S3/MinIO config; scaffold mobile source.                                                                                               |
| module-boundaries           | Runtime mounted modules and infrastructure injection; Next root layout and FSD slices; separate Refine admin providers/routes; contracts public exports. Import arrows summarize established direction, not a proof of every import. |
| authentication              | Authentication composition/service, issuer, cookie policy, in-memory web store and refresh coordinator; rotation/replay and active-session rejection.                                                                                |
| ai-job-lifecycle            | Admission participant, trusted catalog, closed credit port, bounded rotating root worker slots and typed dictionary/sentence services; immutable selection/tariff and distinct failure settlement.                                   |
| dictionaries-and-learning   | Authoring/generation services and store; flashcard service/composition/client model and API; typed sentence worker; version-based invalidation and free stored-reference review.                                                     |
| texts-and-vocabulary        | Texts content composition/store, job service/worker, frontend job API/workspace hook, dictionary selection source/target transaction; explicit Save versus Add publication.                                                          |
| conversations-and-knowledge | Frontend admission/replay transport; operation-bound worker composition/service; Mastra runner/tools/model gate/storage; Knowledge service and store publication participant.                                                        |
| speech-and-pricing          | Frontend speech API; source-bound service; Drizzle speech prepare/confirm/store; worker submit/poll/output path; normalized eligibility, catalog registry, credit interface and shared root slots.                                   |
| development-and-deployment  | Root package/Compose; explicit durable/purge worker commands; isolated document test stack; release manifest/deployment/NGINX sources. Tooling topology is not actual deployment evidence.                                           |

Each diagram lists its own exact source paths and document-relative links. Relevant
accepted ADRs were reconciled with inspected composition/services; prior decision
contexts were not rewritten. Scoped rg/file/body reads were sufficient for this
analysis; no semantic-tool completeness claim is made. Representative texts worker
and conversation worker tests support the validation/SDK/lease shape; tests were
read as supporting evidence and not claimed newly executed by this documentation run.

## Discrepancies and deliberate distinctions

1. `docs/architecture.md` opening sketch/backend paragraph marks private document
   storage/scanner/parser as planned. Current worker composition already contains
   configured S3, ClamAV and sandbox parser adapters. Diagrams show implemented,
   configuration-gated integration; they do not claim a live production scanner.
2. ADR-0035 context and older backend-first planning describe deferred Texts UI.
   Current Next route/page/workspace and frontend API code implement that surface.
   Diagram notes label the older statement as phase context.
3. ADR-0024 originally defaulted flashcards off. ADR-0025 supersedes that clause;
   diagrams describe enabled-by-default with an explicit off switch.
4. ADR-0026's platform Auto is narrowed by ADR-0037 for conversations: Flash Auto,
   explicit incompatible selection rejects without fallback. Current admission
   participant confirms the exception.
5. Final cleanup under ADR-0040 removes the parallel owner-scoped dictionary audio
   protocol/worker/client and migration CLI. The speech view now describes sole
   current shared speech, configuration flags, guarded 0074 retirement of the three
   old tables, and the retained speech-owned physical byte table. Provider/storage
   configuration names DICTIONARY_AUDIO_* remain live; current recorded-task/key
   mappings are retained. Root worker composition confirms coordinator alternation
   between dictionary generation and shared speech, with no old audio sub-worker.
6. Historical ADRs describe model compatibility/rollout assumptions. Accepted ADR-0038
   retires DeepSeek Chat/arbitrary legacy routes without rewriting snapshots or
   accounting. AI lifecycle now shows rejection of retired pinned execution,
   supported-format retention and explicit configuration repair. Cleanup owner
   confirmed unmanaged deterministic/curated dictionary mode is active behavior;
   AI lifecycle explicitly branches this null-snapshot route from managed selection.
   Final catalog
   source review/stamping must run after concurrent cleanup changes settle.
7. Mobile is a static home scaffold. Course/adaptive-tutor product journeys remain
   future concepts; the implemented contextual tutor is shown only through current
   conversation work. No production deployment is asserted by release tooling.

## Verification and remaining work

- Authoring script checked every listed path exists; exactly nine diagrams created.
- Source fingerprints computed from sorted exact input paths and SHA256 bytes.
- `pnpm diagrams:check -- --stamp` passed after reviewed input reconciliation.
- `pnpm diagrams:check` passed for all nine diagrams (syntax, schema, exact files, freshness).
- Renderer/browser evidence remains owned by main; source validation is not substituted for it.
- Re-run freshness after any further concurrent input edits; substantive input changes require source review before another stamp.
- Hash freshness proves only recorded input equality; it cannot prove every edge or
  discover new components. No paid services, private data, database mutation or
  deployment were used to construct these views.

## Final-state review after extended cleanup

Reviewed accepted ADR-0039 and ADR-0040 in full, current server/catalog sources,
health route, speech composition/configuration/budget/blob schema, guarded migration
0074, worker command/runtime, release CLI, shared-speech manifest validation and
changed composition roots. Used changed-path discovery plus scoped source bodies
and diffs to reconcile the actual final runtime. No removed path remains in a
source list or source link. Nine views remain; no duplicate alternate catalog.

The development view now identifies backend /livez and /readyz, distinguishes the
atlas's independent /health endpoint, connects its read-only server to Markdown
and source-review fingerprints, and records sharedSpeech.speechBudget/modelPricing
release metadata. The old pronunciationAudio metadata/CLI route is retired.
The system and speech views identify ADR-0040 current ownership. Pure source
forwarders/Popover aliases were not diagram nodes and removing them does not
change the documented module dependencies or user flows.

Source discovery is bounded to composition roots, routes and representative
application/admission/worker/store/client implementations for these nine views,
the selected exact file lists, applicable accepted ADRs, current architecture and
root operational configuration. It includes newly introduced server/schema/migration
inputs and deleted-path detection; it is not exhaustive discovery of every dynamic
registration, import, test or optional provider deployment. No local credentials,
private runtime data, remote deployment state or paid provider behavior was used.
Earlier representative tests are supporting design evidence, not new execution
claims. Main owns final rendered/browser evidence and broader feature verification.

Final fingerprints are refreshed only after main/cleanup owners report source
stability and the source/diff reconciliation above. A later edit to a selected
input requires the normal freshness check and source review again.
