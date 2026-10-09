---
name: efficient-code-search
description: Locate and analyze Languon implementation, definitions, references, callers and syntax patterns using scoped text search, available LSP tools and ast-grep. Use for code exploration before changes or reviews. Do not use for documentation-only discovery, external research or as a replacement for verification.
---

# Efficient code search

Root and closest `AGENTS.md`, durable work state and accepted ADRs remain
mandatory. Choose the smallest search that answers the current question; do not
run all tools for every query or repeat a full-file read as a symbol read.

## Select and narrow

1. Identify the likely app/package and the question: literal/path, symbol identity,
   or syntax shape. Start in that subtree. Expand only when the result is missing
   or evidence shows a boundary crossing. Search source/tests before generated
   artifacts, caches or dependencies; include ignored/hidden source deliberately.
2. Use **text search** for filenames, error/copy strings, configuration keys and
   initial candidates. Prefer `rg --files <scope>`, `rg -l -F 'literal' <scope>`
   for files or `rg -n -F 'literal' <scope>` for locations. If rg is unavailable,
   use `find <scope> -type f` or `grep -RInF --include='*.ts' --include='*.tsx'
'literal' <scope>`. Use `--` before dash-prefixed patterns. Select file globs
   for other languages; avoid broad unfiltered root dumps.
3. Use **available LSP/symbol tools** for definitions, references, implementations,
   types and a compact file overview. Discover the tools actually exposed by the
   agent; initialize according to their provider instructions and verify the
   active project. With Serena, read `initial_instructions`, use `find_symbol`
   with `relative_path`, then `find_referencing_symbols` on the returned symbol.
   Request bodies only for relevant symbols. Serena locations are zero-based;
   convert to one-based lines for user-facing file links. Do not add an MCP server
   merely to answer one query. If missing/unhealthy, fall back to scoped text/AST
   queries and report the limitation when semantic coverage matters.
4. Use **AST search** for calls, imports, JSX or repeated syntax whose whitespace
   or nesting varies. From the repository root use the pinned command:

    ```sh
    pnpm search:ast run --lang tsx --pattern 'createLearningApi($$$ARGS)' apps/web/src/fsd/widgets/dictionary-training --json=compact
    pnpm search:ast run --lang tsx --pattern '<Dialog $$$ATTRS>$$$CHILDREN</Dialog>' apps/web/src/fsd/widgets/dictionary-training --json=compact
    pnpm search:ast run --lang ts --pattern 'import { $$$NAMES } from $MODULE' packages/contracts/src --json=compact
    ```

    Single-quote patterns in the shell: `$NAME` matches one AST node and
    `$$$NAME` matches zero or more nodes. Use `--lang ts` for TS and `--lang tsx`
    for JSX/TSX; split mixed-language queries. Prefer explicit files/directories.
    AST matching is syntactic: same-spelled calls may resolve to different symbols,
    while aliases/dynamic dispatch can escape the pattern. Use LSP to distinguish
    identities when needed. Check `pnpm search:ast run --help` for supported flags.
    Keep search read-only: `--rewrite`, `--update-all` and interactive rewrites
    belong to separately scoped implementation, never exploration.

## Inspect and finish

Read enough surrounding source to understand imports, guards and side effects;
follow the relevant caller/implementation/test rather than loading entire folders.
Batch independent bounded searches; keep dependent follow-ups sequential. If output
is truncated, narrow paths/patterns or request filenames first. A truncated result
is not a complete caller list. Exit 1 from AST search means no match; other failures
need diagnosis, not an absence claim. Check parser/language/path/index state before
concluding a symbol is absent. Review indirect uses and string-based registration
when impact matters; tool output does not prove runtime reachability.

Stop exploration when you can name the owning implementation, relevant callers or
contracts, neighboring tests and the uncertainty that affects the task. Record
those locations in active work state only when needed for continuation. Preserve
normal review/testing requirements even after a successful LSP refactor; do not
claim measured time/token savings without a comparable evaluation.
