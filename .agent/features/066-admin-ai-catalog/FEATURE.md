# Read-only admin AI catalog

Status: Complete
Created: 2026-11-13
Owner: Engineering

## Goal and authorization

User explicitly authorized a full feature showing app agent prompts and tool descriptions/input/output in admin, with simple extension for future definitions. Scope is checked-in app-authored metadata and schemas, never learner requests, credentials or final request-resolved prompts.

## Acceptance criteria

- AC1: Active administration owners can browse/search/filter Agents, Tools and Prompts from existing admin navigation; unauthorized users cannot retrieve metadata.
- AC2: Prompt bodies and static agent instructions reflect canonical production definitions, including relationships to tools/templates and clear disclosure of dynamic/SDK-owned additions and conditional availability.
- AC3: Tools show description and input/output/request-context JSON Schemas, with missing/approximate schema limitations explicit.
- AC4: Catalog inspection never constructs/runs an agent/tool/model/workflow, reads secrets/user context or changes routing/persistence. GET-only API validates request/response and uses existing admin guard/error convention.
- AC5: Adding a definition uses reusable canonical metadata plus one backend registration; frontend remains generic. New prompts appear from prompt registry. Registration coverage and relationship tests catch omissions and dangling refs.
- AC6: Existing factory instructions, descriptions, schemas and execution behavior remain unchanged; focused factory regressions prove extraction preserves contracts.
- AC7: Long prompts, schema text, relationships, loading/error/retry/empty and narrow layouts are safe/readable; all definition text renders as text, never HTML/Markdown execution.
- AC8: Focused backend/frontend/contracts/prompt/static/build checks, selected authenticated E2E and real-browser evidence pass; guide/index/extension docs are current; independent completion and security reviews approve final evidence.

## UI direction

Extend approved Ant Design admin list/detail pattern (AI routing and sentence library) with kind tabs/counts, labeled search, scope filter, explicit details and responsive Drawer. Reuse AdminThemeProvider tokens; no new theme. Designer ai_catalog_design supplied bounded brief; rendered critique follows real app. Admin has no Storybook infrastructure; isolated leaf rendering tests with long/hostile fixtures follow its documented exception.

## Boundaries

No prompt editing, tool execution, real user prompt history, remote Langfuse version management, provider activation, runtime dependencies, database migration or deployment changes. App-authored static content is authoritative; request-bound/SDK-generated material is labeled unavailable rather than invented. No change to admin membership policy. Existing structured metadata/REST patterns apply; local module choices recorded in ExecPlan, no new strategic architecture commitment.
