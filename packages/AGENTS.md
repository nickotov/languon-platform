# Shared package instructions

Packages expose stable, narrowly scoped capabilities to applications. Keep each
package framework-agnostic unless its name and purpose explicitly bind it to a
framework. Export only through the package public entry point; consumers must
not deep-import source files.

- `contracts`: Zod schemas are authoritative; derive types from them. Do not add
  transport, persistence, or UI behavior.
- `database`: expose infrastructure factories and low-level types only. Business
  repositories belong in backend modules.
- `prompts`: keep checked-in local fallbacks deterministic and free of secrets;
  hide Langfuse and model-provider details behind adapters.

Preserve backward compatibility for any public export already used by multiple
applications, or coordinate the migration in one ExecPlan. Add behavior-focused
tests for package logic and build packages before dependent workspace checks.

```sh
pnpm --filter './packages/*' build
pnpm --filter './packages/*' test
pnpm --filter './packages/*' typecheck
```
