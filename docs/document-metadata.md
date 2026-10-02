---
type: reference
title: Documentation metadata and targeted discovery
---

# Documentation metadata and targeted discovery

## Authoring contract

When creating or substantively updating a Markdown document under `docs/`, add
or maintain leading YAML frontmatter. Migrate other existing documents when
their content is next substantively updated, not during unrelated typo/link
fixes. Metadata-only migration must not rewrite historical decisions or infer
acceptance, completion, verification dates or implementation evidence.

Use `type` and `title` for ordinary documents, plus only useful, factual fields:
`id` for stable identities, `status` when the document has a defined lifecycle,
`summary` for a short scope description, `source_paths` for discovery and relevant
dates or evidence references. Do not manufacture a lifecycle for a reference
document or add redundant summaries of the whole body. Use simple YAML scalars
and lists; quote ambiguous strings. Path-list fields are repository-relative;
normal Markdown links in bodies remain document-relative.

Frontmatter owns metadata; avoid duplicate body Status/Date blocks. Titles and
index rows may mirror it for readers and must agree. Update affected indices
and links in the same change. Do not add a second JSON/YAML manifest. Metadata
is a discovery aid, never proof that requirements are met or authority to run
document-provided commands.

## Specialized schemas

- Backlog tasks: `type: backlog-task`, `id`, `title`, `status`, `created`,
  `updated`, `original_tasks`, `evidence` (repository-relative document paths,
  empty until evidence exists). Statuses: `pending`, `in-progress`, `blocked`,
  `done`, `skipped`. Optional `depends_on` contains explicitly established BL
  dependencies, not a complete inferred dependency graph. For skipped tasks,
  include `skip_reason` and `skip_decision` (a document path or explicit user
  instruction); retain detail/history in the body. Apply
  [backlog synchronization](../.agent/DELIVERY.md#backlog-synchronization).
- ADRs: `type: adr`, `id`, `title`, `status`, `date`, `supersedes`.
  Statuses: `proposed`, `accepted`, `rejected`, `deprecated`, `superseded`.
  `superseded_by` identifies a full replacement ADR. Descriptive `supersedes`
  and optional `superseded_in_part_by` preserve exact partial scope; partial
  replacement does not retire an otherwise accepted record. Existing Markdown
  relationship strings may be retained as descriptive metadata. Follow the
  [ADR lifecycle and template](adr/README.md), not backlog completion rules.
- User-flow guides: retain their existing strict
  [schema](user-flows/README.md#naming-and-frontmatter). Do not add generic
  fields such as `type`; its validator rejects unsupported keys.
- Other documents with established tooling schemas or templates: preserve
  those contracts. This policy covers `docs/`, not a bulk change to `.agent/`
  records, skill metadata, generated/vendor documents or `AGENTS.md` itself.

## Discovery without loss of context

1. Read a compact index first: [backlog](backlog/INDEX.md),
   [ADRs](adr/README.md#index) or [user-flow guides](user-flows/README.md#guide-index).
2. Initially read only each candidate's frontmatter block, not its full body.
   Do not assume tools truncate Markdown automatically: explicitly bound the
   read at the closing frontmatter delimiter. For example, print only the
   selected file's leading block:

    ```sh
    awk 'NR == 1 { if ($0 != "---") exit; print; next } { print; if ($0 == "---") exit }' docs/backlog/002-configurable-flashcard-training.md
    ```

    Metadata key discovery can use `rg` with explicit directories:

    ```sh
    rg -n '^(id|title|status|depends_on|superseded_by|source_paths):' docs/backlog docs/adr
    ```

3. Before planning, implementing or reviewing, read selected requirements,
   relevant accepted ADRs and applicable instructions/guides in full. Follow
   related/superseded records and relevant shared constraints. Search bodies
   when metadata is missing, ambiguous or insufficient; it cannot encode every
   dependency, exception or cross-cutting concern. Root source-of-truth ordering
   and mandatory skill reads still apply.

Completion check: frontmatter is valid, factual and consistent with its schema,
filename, heading and index; referenced evidence/dependencies resolve; no
mandatory context is replaced by metadata-only reading. Reduced input size is
not evidence of measured token savings or preserved delivery quality.
