# Revised workflow decision probes

Revised-only decision checks, one fresh agent for each selected case. Full responses
were saved before the evaluator rubric was read. Instructions/selected synthetic
facts were copied outside the checkout; rubric, protocol, other cases and old
responses were excluded. This was not an OS-enforced filesystem jail; agents were
explicitly constrained to those copies. No actual implementation or test execution
was requested or claimed. Manifest records the instruction digest and full response
hashes; stored transcripts have a terminal newline.

| Case | Material rubric decisions                                                                                                                      | Result and response evidence                                                                                                                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | Correction/small fix; minimal real rendered proof; no broad suite or feature ceremony.                                                         | Pass: “One real browser/device observation”; “No new implementation-mirroring test, broad suite, browser matrix, database checks, or full critical gate is warranted.” [Full response](01.txt).                                                                                                                                                           |
| 05   | Remediation scope; reuse unchanged backend evidence; renew changed browser proof; completion pending.                                          | Pass: “Use remediation review of revision A → B”; “A’s browser evidence cannot establish the newly added Cancel action at B”; “Previously required final gates still need valid evidence.” [Full response](05.txt).                                                                                                                                       |
| 06   | Reject unsafe lightweight route; preserve auth invariants and feature/ADR authority; retain real security/transaction/full gate if authorized. | Pass: “Work may proceed only through read-only discovery”; “Feature authorization alone does not silently supersede accepted ADRs”; requires real transaction tests and full shared-auth gate. [Full response](06.txt).                                                                                                                                   |
| 08   | Consumer inventory, early real seam, fast scoped loop, source-review fixes before broad gate, measured setup and final full gate.              | Fail (SDV-R1): maps HTTP/MCP/DB/admin/SDK/history but omits who may preview/apply/publish/edit; “Retain one small production-composition integration”; “Do not use the approximately 12-minute backend stage as a per-edit command”; “Completion can be approved only after required final coverage passes for the final patch.” [Full response](08.txt). |

Initial variant: cases01/05/06 pass; case08 fails its permission-authority discovery condition (SDV-R1). No authority conflict,
unauthorized side effect or fabricated executed-check claim was observed in the
responses. The supplied case08 instruction snapshot includes current accepted ADRs;
this is a policy decision probe, not a historical application replay.

Cases02/03/04/07 were not run. There is no old-instruction control, repeated matched
experiment, actual delivery replay, token/time measurement or efficiency claim.
These checks support instruction interpretation and retained guardrails only.

## Revised variant2: focused SDV-R1 remediation

Only `.agent/DELIVERY.md` changed in the allowed instruction snapshot: privileged
writers/shared contracts now require an entrypoint caller/credential/permission
map and proof that schema widening cannot broaden old authority. Original case08
and its failed response remain unchanged. Three fresh sessions received the same
case and wrapper with separate snapshot copies; no rubric, finding, author rationale
or expected answer was supplied to them. The evaluator already knew the rubric
from initial grading; this is a revised-only decision check, not a blinded paired
experiment. See [revised manifest](probe-manifest-r2.json) for hashes.

| Repetition           | Authority discovery evidence                                                                                                                                                                  | Other case08 material conditions                                                                                                                           | Result |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [08-r2a](08-r2a.txt) | “An authority matrix identifying who can read, preview, apply and edit each price form”; old HTTP writer/credential cannot publish native rules; apply rechecks scope/version/payload/replay. | Early real SDK/DB proof, valid fixtures, scoped loops, review fixes before full gate, measured setup, final approval withheld.                             | Pass   |
| [08-r2b](08-r2b.txt) | “For each privileged entrypoint, identify credentials, permitted fields/actions, validation, version checks, audit and replay”; separate native publication action and old writer denial.     | Retains all three provider families, real transaction evidence, source review, final complete gate, focused failure diagnosis and no fabricated execution. | Pass   |
| [08-r2c](08-r2c.txt) | “Prove widening validation cannot grant native publication to the existing flat HTTP writer or old issued MCP credentials.”                                                                   | Preserves early real seam, transitive consumers, full final gate, security and browser requirements, setup diagnosis and final-patch evidence.             | Pass   |

Variant2 case08 passes3/3 fresh repetitions. Earlier cases01/05/06 remain valid for
the unchanged classification, small-fix, remediation and final-evidence rules;
the added privileged-writer question does not remove or alter those decisions.
The original failure is retained, not counted as a passing attempt. No actual
runtime/quality/token savings were measured or claimed. Independent regrading and
final evidence approval are recorded in the improvement record.
