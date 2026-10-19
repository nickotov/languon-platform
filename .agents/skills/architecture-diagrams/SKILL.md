---
name: architecture-diagrams
description: Create, review, or actualize Languon architecture, data-flow and logic diagrams from implementation, accepted ADRs and current documentation, with source evidence and freshness checks. Use for a current-state architecture map or diagram maintenance. Do not use for speculative product design, generic illustrations, or changing application behavior to match a diagram.
---

# Architecture diagrams

## Establish the diagram contract

1. Read root/closest `AGENTS.md`, current Git state and the active delivery record.
   Follow root classification and [shared delivery](../../../.agent/DELIVERY.md).
   Inspect [the diagram catalog](../../../docs/diagrams/README.md) before creating
   another representation. Read its maintained format and existing diagrams; reuse
   a diagram when the requested question and audience match. Exit with questions
   the diagrams will answer and the bounded systems/flows they cover.

2. Discover current docs and user-flow guides through compact indexes/frontmatter,
   then read relevant requirements and accepted ADRs in full. Use
   [$efficient-code-search](../efficient-code-search/SKILL.md) to follow real entry
   points, composition roots, routes, application services, adapters and consumers.
   Trace frontend API calls to backend handlers and persistence/worker effects.
   Include configuration/feature gates and current error/retry/ownership/accounting
   branches when they materially change the flow. Inspect representative tests as
   supporting evidence. Exit when each material relationship has an inspectable
   code/config source and relevant architectural constraints have been checked.

## Reconcile and draw

3. Show implemented behavior as current state. Label scaffold, planned, optional
   and external components explicitly. When code and an accepted ADR/current guide
   disagree, record the observed implementation and the conflicting source; do not
   silently declare either one authoritative evidence of runtime behavior. Historical
   proposals and old feature records supply context, not current-state proof. Record
   unknowns and verification limits instead of inventing a connection. Diagram work
   does not authorize changing the app or superseding an accepted ADR.

4. Maintain focused Mermaid diagrams using the catalog's schema and conventions.
   Use a system boundary view for orientation and flow/sequence/state views where
   they explain behavior. Name actors, components, payloads, storage and transition
   conditions concretely. Split a dense graph by a meaningful question; connect it
   to related diagrams. Cover success and consequential failure/async branches.
   Keep each explanation, source references and implementation/design discrepancies
   next to its diagram. Exit when the requested questions are answered without
   implying unsupported runtime components or hiding material flow branches.

## Establish freshness and validate

5. Use diagram Markdown frontmatter as the single catalog: `type: diagram`, `title`,
   `summary`, exact-file `source_paths`, `source_fingerprint: sha256:<digest>` and
   `reviewed` date.
   Follow the catalog's input/hash format. Include the implementation, configuration,
   accepted ADR and current-doc inputs that materially justify each diagram; broad
   root-directory hashes are not a substitute for selected sources. After inspecting
   changed inputs, revise the affected diagrams and regenerate their fingerprints
   with `pnpm diagrams:check -- --stamp`. Never refresh hashes merely to dismiss a stale
   warning. Hash equality proves unchanged recorded inputs, not architectural
   completeness: discover newly added relevant routes/modules and update inputs.
   Changes during a cleanup/refactor require final-state reconciliation before
   recording the catalog as current.

6. Run `pnpm diagrams:check` from the root, resolve invalid syntax/source paths or
   stale inputs, and start `pnpm diagrams` using the documented local viewer command.
   Inspect rendered diagrams through [$browser-verification](../browser-verification/SKILL.md)
   when diagram/viewer presentation changes: verify labels, clipping, selection,
   readable layout and source inspection at an appropriate viewport. Keep viewer
   assets local and the existing read-only boundary intact. Update diagram metadata
   using [documentation metadata](../../../docs/document-metadata.md) and maintain
   applicable guides through [$user-flow-e2e](../user-flow-e2e/SKILL.md). Record exact
   checks, rendered evidence, covered flows, source discrepancies and remaining
   unknowns in the active delivery record. Completion requires all selected inputs
   fresh, all diagrams valid and real rendered evidence; report missing runtime
   evidence explicitly if the viewer is unavailable.
