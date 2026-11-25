# Backend audit remediation

Status: Complete

The [audit](../../../docs/backend-quality-audit.md) and [improvement record](../../improvements/backend-quality-audit-followup.md) identify remaining failures affecting sign-out, transcription, untrusted inputs, workbook discovery and retention. The user authorized the full feature workflow on 2026-11-25.

## Acceptance criteria

- AC-1. Concurrent refresh cannot leave a successor usable after all-session revocation or password replacement. Preserve replay-family revocation and allow a subsequent legitimate login.
- AC-2. A completed provider call retains its successful result through transient publication failure or ambiguous acknowledgement within its valid fence. No provider redispatch, double settlement, stale publication or lost cancellation protection.
- AC-3. Fenced transcription settlement publishes eligible transcripts, records representable duration exactly, keeps unrepresentable observations unknown and preserves customer and operator accounting invariants across both text and transcription. All six known SQL failures pass.
- AC-4. Remediate the five direct vulnerable dependency resolutions, verify their installed graph and exercise normal parsing, HTTP policy and validation paths using safe fixtures.
- AC-5. Learners can reach every live owned workbook beyond 500, with deterministic continuation across equal timestamps in an unchanged list. Preserve owner isolation, ordered members, sharing state and bounded query count per page.
- AC-6. A documented, invoked maintenance owner prunes expired authentication audit events in bounded indexed batches, retaining fresh rows and supporting repeated execution.

## Constraints and guides

Use forward migrations on disposable infrastructure for proof. Preserve provider-call, replay, financial authority, deadline and ownership boundaries. Deployment and production data modifications are outside this local delivery. Integrate workbook pagination with existing UI patterns. Maintain existing guides for user authentication, interactive workbooks, Knowledge transcription and any changed operational command. This is a coordinated repair of existing journeys; the specific guides own the executable scenarios.
