---
type: reference
title: Read-only admin AI catalog
source_paths:
    - apps/backend/src/modules/administration/infrastructure/ai-catalog.ts
    - apps/backend/src/modules/administration/infrastructure/ai-catalog/**
    - apps/backend/src/modules/administration/interface/http/admin-ai-catalog.routes.ts
    - apps/admin/src/pages/ai-catalog/**
    - packages/contracts/src/ai-catalog.ts
    - packages/prompts/src/index.ts
---

# Read-only admin AI catalog

Open **AI catalog** in the admin application to inspect the application's agents,
local prompt templates and tool contracts. Search or filter the list, open an
entry, and follow its related prompt, agent or tool links. Tool details show the
canonical description and structural input, output and request-context schemas.
Agent details show their static system instructions and the conditions that
change the final instruction or available tools.

The catalog exposes definitions from the deployed backend code. Reading it does
not construct a Mastra agent, invoke a tool, call a model, retrieve a remote
prompt or create a learner operation. It requires the existing active admin
membership. There are no edit, execute or publish controls.

## What the entries mean

- **Application:** a definition used by an application operation. Registration
  does not mean a tool is available in every conversation or that a model route
  is configured.
- **Development:** a verification or playground definition. These are identified
  separately from learner-facing execution.
- **Template:** a checked-in prompt without a registered agent/tool consumer.
  For example, the course-builder template does not imply implemented courses.

A playground generator and its application counterpart use the same runtime tool
ID but have different envelopes. Their catalog identities are distinct:
`generate_vocabulary` is the application entry and
`playground.generate_vocabulary` is the Studio adapter. The detail name retains
its actual runtime ID. Catalog references always contain both `kind` and `id`,
so an agent and a prompt may share an ID without being confused.

The catalog shows checked-in local prompts. Request-specific preferences,
conversation history, source passages, learner answers and credentials are
excluded. The tutor appends authorized context at execution; the verification
agent appends its response variant; administrative flow checks replace their
quick-check instruction with a selected synthetic flow contract. These additions
are described in the affected entry rather than populated with private data.
The contextual tutor also uses observational-memory instructions owned by the
installed Mastra SDK; those are not application-authored templates.

JSON Schema is a structural representation of the canonical Zod schema. Custom
refinements and transforms may not have an equivalent representation. The
runtime schema remains authoritative, and tool details disclose this limitation.
An unpublished schema or a failed conversion is explicitly unavailable rather
than being guessed. No learner request is validated or executed by the catalog UI.

## Extend agents and tools

Use the same exported definition for runtime construction and catalog inspection.
The definition belongs next to the owning factory. It contains static metadata
and schemas, while the factory binds the model, callbacks, authorization and
operation state.

For a new agent:

1. Export a `*Definition` object containing its canonical `id`, `name` and static
   `instructions`. Spread that object into `new Agent(...)`. Append dynamic
   instructions in the factory where needed; describe those additions in the
   catalog's limitations.
2. Add one registration to
   [agent-definitions.ts](../apps/backend/src/modules/administration/infrastructure/ai-catalog/agent-definitions.ts),
   importing the canonical object or pure definition getter. Supply the owning
   module, scope, prompt/tool references and availability notes.
3. Retain normal canonical Mastra composition and execution-policy registration.
   A catalog entry supplies inspection metadata, not execution authority.

For a new tool:

1. Export a `*Definition` containing `id`, `description`, `inputSchema`,
   `outputSchema` and any `requestContextSchema`. Spread it into
   `createTool(...)`, supplying `execute` only in the owning runtime factory.
2. Add one registration to
   [tool-definitions.ts](../apps/backend/src/modules/administration/infrastructure/ai-catalog/tool-definitions.ts).
   Supply its owning module, application/development scope and conditional
   availability notes. A pure definition getter is suitable for a family of
   tools sharing an implementation, such as the content generators.
3. Add its related agent/prompt references. Use an explicit namespaced catalog
   ID for a development variant sharing an application's runtime ID.

Both changes use the existing generic list/detail API and admin page; they need
no new endpoint or UI branch. Do not register a live agent instance or an
operation-bound tool merely to inspect its configuration.

Useful current examples are
[learningContentToolDefinition](../apps/backend/src/modules/conversations/infrastructure/ai/learning-content-tools.ts),
[ReadSourceContextDefinition](../apps/backend/src/modules/conversations/infrastructure/ai/contextual-tutor-tools.ts)
and the
[tutor request agent definitions](../apps/backend/src/modules/conversations/infrastructure/ai/tutor-request-agents.ts).
The catalog query composes these descriptors in
[ai-catalog.ts](../apps/backend/src/modules/administration/infrastructure/ai-catalog.ts).

## Extend prompts

Add a local prompt definition and register it once in
[packages/prompts/src/index.ts](../packages/prompts/src/index.ts), including its
source path. `getLocalPrompt` and `listLocalPrompts` use that same registry.
The new prompt automatically appears in the catalog. Link it from its agent or
tool registration when used; otherwise it is labeled **Template**.

Changing prompt selection, introducing remote prompt management, or exposing
request history needs its own authorized implementation. This inspection feature
does not implement the pending versioned Langfuse prompt-resolution backlog.

## Verify an extension

Run the focused catalog suite from the repository root:

```sh
pnpm --filter @languon/backend exec vitest run tests/unit/modules/administration/ai-catalog.test.ts
```

It checks unique identities, resolvable relationships, exact local prompt bytes,
canonical schema/instruction reuse, immutable query results, development/template
classification and registration of new factories. Its source inventory requires
`new Agent` and `createTool` call sites to spread an exported `*Definition` that
participates in catalog composition. Keep that convention for new factories;
update the inventory deliberately if an equivalent new construction mechanism
is introduced.

Also run the affected factory/tool tests and admin authorization/UI checks. Read
[the development registration checklist](development.md#registering-mastra-primitives)
for the separate requirements to make new primitives executable in Studio.
