---
name: development-cleanup
description: Audit and remove evidenced obsolete runtime code, backward-compatibility paths, retired model configuration, and associated disposable development data in Languon. Use for preproduction cleanup or a stale-code retirement run. Do not use for general code review, age-based deletion, or blanket database resets.
---

# Development cleanup

## Bound the run

1. Read root/closest `AGENTS.md`, current Git state and the active delivery record.
   Use the root classifier and [shared delivery procedure](../../../.agent/DELIVERY.md);
   this skill supplies retirement analysis, not additional feature or Git authority.
   Reuse explicit authorization already given for this scope. Establish the audited
   applications/packages and current supported behavior. Verify the current deployment
   stage from the user's instruction and relevant repository/environment evidence:
   a previous development-only run is not evidence that future deployments are absent.
   Exit with a bounded scope, supported replacement and known data owners.

2. Use [$efficient-code-search](../efficient-code-search/SKILL.md) to trace candidates
   from public entry points, composition roots and callers. Inspect indirect registry
   keys, aliases, dynamic imports, scheduled workers, CLI scripts, package exports,
   environment defaults, admin/playground choices, fixtures and tests. For persisted
   identifiers, inspect schemas, migrations, queued payloads, cached values and replay
   readers. No textual reference or an old comment alone proves runtime reachability
   or obsolescence. Record each candidate's evidence and disposition in the active
   record: remove, retain, or unresolved. Bound any claim of complete coverage to the
   actual inspected surfaces.

## Decide and remove

3. Separate executable compatibility from historical evidence. Preserve historical
   ADRs, surveys and completed feature/review records as history. Update current
   documentation and examples that advertise retired behavior. Read relevant accepted
   ADRs through [their index](../../../docs/adr/README.md); supersede an active rule
   through root ADR policy when retirement changes it. Do not rewrite an accepted
   decision to make deletion appear compliant.

    Retain failure, retry/replay, idempotency, ownership, accounting and security
    protections used by current workflows. A legacy-looking decoder can still protect
    terminal jobs or ledger integrity. Remove it only after establishing the reachable
    replacement or an authorized retirement of its data consumers. An unresolved
    product, contract, persistence or trust-boundary decision follows root escalation;
    continue independent safe work. Exit when every proposed deletion has a supported
    reason and its affected consumers are accounted for.

4. Remove each coherent retired path with its dead exports, configuration choices,
   fixtures and tests that exist solely for the removed behavior. Keep regression
   checks proving current behavior and rejection of retired inputs where meaningful.
   Update applicable user-flow mappings through [$user-flow-e2e](../user-flow-e2e/SKILL.md).
   Use project generators/commands for generated migrations and lockfiles. A clean
   development database may simplify compatibility only within authorized scope;
   schema/history changes still follow root persistence and ADR rules.

## Clean data only when necessary

5. Before data mutation, use [$db-verification](../db-verification/SKILL.md). Establish
   the resolved host, database/cache namespace and environment without exposing
   credentials; verify that the target is local, disposable and within the user's
   authorized deletion scope. Localhost alone does not establish disposability.
   Identify exact tables/keys/rows, dependencies and preflight counts using read-only
   inspection. Prefer a targeted transaction or namespaced deletion with explicit
   postconditions; preserve unrelated data and current audit/accounting invariants.
   If target ownership or deletion authority is uncertain, stop data mutation and
   report that specific gap while finishing independent code work. Never turn “data
   can be cleaned” into an arbitrary global reset, `FLUSHALL`, or shared-data deletion.
   Record sanitized target identity, exact scope, counts, command and result. When no
   persisted obsolete data needs removal, record that evidence rather than resetting.

## Verify and report

6. Use [$testing](../testing/SKILL.md) for affected checks, disposable database
   evidence when persistence changes, and browser/device evidence when observable
   behavior changes. Rerun scoped reference searches to find remaining executable
   consumers; explain historical and intentionally retained matches. Apply root
   independent/security review triggers. Record removals, retained candidates and
   reasons, verification, remaining uncertainty and restoration/reset notes in the
   active record. Completion requires current workflows to pass, no dangling runtime
   consumers, and no unreported data-cleaning or coverage gap.
