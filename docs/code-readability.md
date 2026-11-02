---
type: reference
title: Code readability standards
source_paths:
    - scripts/eslint-readability.mjs
    - scripts/eslint-persistence-readability.mjs
    - apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-runner.ts
    - apps/web/src/fsd/features/knowledge-notes/ui/proposal-block-content/proposal-block-content.tsx
---

# Code readability standards

Apply to maintained handwritten implementations and tests in every application,
package and tool. Existing DDD/FSD and app-specific instructions still own module
placement. This guide owns clarity requirements; Prettier owns indentation/wrapping,
ESLint owns mechanical checks, and review assesses meaning and decomposition.

## Organize code by purpose

Separate validation, preparation, execution, persistence and result construction
with blank lines when those phases exist. Also separate independent derivation
groups, hook calls, handlers and the render return. Keep related declarations
together; a blank line after every statement adds noise. Use braces for all
conditional and loop bodies, including guard clauses. Keep short related branches
readable rather than compressing them into chained expressions.

```ts
const ownerId = input.ownerId;
const conversationId = input.conversationId;

const resolvedModel = await resolveTutorModel(options.model);
const memory = createTutorMemory({ input, resolvedModel, modelGate });

return createTutorAgent({ memory, resolvedModel });
```

This is an illustrative sequence, not a reusable API. Preserve side-effect order,
await placement, error boundaries and transaction scope when introducing groups.

## Make decisions understandable

Use names that describe roles: `resolvedModel`, `modelGate`, `exerciseSection`.
Short names such as `id` or `index` are appropriate in a small obvious scope;
renaming everything to long phrases does not improve clarity.

Name a compound predicate when understanding it requires domain, SDK or protocol
knowledge. Encapsulate resolution/validation together when callers should not need
that knowledge. Prefer a local function to repeating type-shape checks.

```ts
// Already constructed SDK adapters carry a version marker; model IDs and
// configuration objects still need resolution through the router.
const isModelAdapter =
    typeof model === 'object' && 'specificationVersion' in model;

const resolvedModel = isModelAdapter ? model : await resolveModelConfig(model);
```

Explain why the marker matters, not merely that an object has a property. Do not
add null guards, normalize values or change accepted inputs silently during a
readability-only refactor. A discovered correctness issue needs explicit tracking.

Use early returns or explicit branches for complex conditions and nested ternaries.
Keep a short binary ternary when its alternatives are immediately clear.

## Extract cohesive responsibilities

An orchestration function should reveal meaningful steps. Extract substantial
configuration or a cohesive operation when it hides that sequence. For example,
`createTutorMemory` can own storage composition, observation/reflection settings
and logger setup; `resolveTutorModel` can own model resolution and compatibility.
If only options are built, name the function `buildObservationalMemoryOptions`.

Keep helpers private and local first. Move to another file only for a coherent
responsibility, independent consumer or meaningful test seam. Preserve public
exports and narrow typed inputs. Avoid helpers accepting an unrelated options bag.

Do not extract arbitrary line ranges or wrappers that merely rename a call:

```ts
// This wrapper hides no decision or invariant; the direct call is clearer.
function obtainItems(store: Store) {
    return store.getItems();
}
```

Review function/file size as a signal, not a target. Follow existing explicit
frontend review thresholds and persistence limits; do not compress code to pass.

## Explain reasons and constraints

Comments should record an invariant, tradeoff, units, SDK limitation or required
ordering that names/types cannot express. Put the comment next to the constraint.
For example: observation must happen before the first actor dispatch because the
pinned SDK otherwise starts threshold observation on a later step. Describe what
would break if that ordering changed. Avoid comments that narrate assignments,
guess at SDK behavior or duplicate the function name. Recheck comments after edits.

## Keep React flow visible

Preserve hook order, dependency arrays, callback identity and render keys. Separate
state/effects, derived values, event handlers and JSX. Name nontrivial render
conditions and use focused children for independently understandable sections.
Keep pure grouping/formatting helpers local or in the owning slice's `lib` when
they have a distinct reusable meaning. Follow app-specific frontend instructions.

```tsx
const canApply = !isApplied && !isStale;
const applyLabel = hasError ? labels.retry : labels.apply;

function handleApply() {
    void applyProposal();
}

return (
    <Button disabled={!canApply} onClick={handleApply}>
        {applyLabel}
    </Button>
);
```

Do not move a monolith into a controller hook or memoize cheap expressions solely
to make JSX shorter. Extract a hook for cohesive stateful behavior. Preserve event
timing, stale-closure handling, accessible states and error/retry behavior.

## Enforcement and clarity review

`scripts/eslint-readability.mjs` defines reusable brace and spacing rules. Normal
`pnpm lint` enforces them across maintained applications, packages, scripts,
infrastructure, tooling and tests. Generated/native output, imported pricing
snapshots and historical design/evidence artifacts are excluded. Persistence
retains its additional established size constraint. BL-018 owns the mechanical
normalization; BL-019 owns systematic clarity review. Passing lint alone does not
establish whole-codebase clarity.

Apply this guide to all new/substantively changed code. Do not disable rules to
hide violations or sweep unrelated files into a bounded task. Prettier preserves
logical blank lines; lint configuration order must keep these rules active after
`eslint-config-prettier`. Frozen artifacts retain their source identities rather
than being reformatted to satisfy a maintained-code gate.

## Author and reviewer checks

- Can the reader follow the main operation without decoding SDK/configuration
  details? Are non-obvious decisions named and their reasons available locally?
- Does each extraction reduce what the caller must understand while keeping
  related invariants and failure handling together?
- Are side effects, awaits, transactions, cancellation, accounting and cleanup
  ordered identically? In React, are hook order, keys and dependencies preserved?
- Are distinct stages visible and comments accurate? Are any wrappers, redundant
  comments or artificial memoization making navigation harder?
- Does evidence cover the changed behavior seam? Formatter success proves layout,
  not clarity; test success alone does not prove refactor equivalence.

For a readability review, report a concrete comprehension problem, its maintenance
or correctness impact and a suggested improvement. Mechanical issues belong to
lint. Do not invent findings based only on personal naming preferences.
