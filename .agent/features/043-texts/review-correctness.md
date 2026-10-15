# Independent correctness review — Texts backend checkpoint

Date: 2026-10-15. Mode: initial. Reviewer: GPT-6.1 Sol independent reviewer.

Verdict: **Backend checkpoint approved after remediation**. CR-01, CR-02 and CR-03 are closed. No material correctness findings remain in the reviewed backend checkpoint. This is a backend checkpoint review; AC10 frontend delivery remains explicitly deferred pending the Magic Patterns handoff, and AC09 follows backend verification.

## Reviewed state and boundary

Base/HEAD: `664198fee9eb1a0492134c43de9a9d04835568af`, uncommitted feature/texts work including tracked changes and new backend, contracts, prompts, script/guide/test files. Initial state anchored by `backend-preflight.sha256`; review-time formatting and ADR renumbering were disclosed and inspected. Full production security/SQL/privacy assessment is assigned to the concurrent security reviewer.

Critical composed-routing state at reproduction:

- `apps/backend/src/app.ts`: SHA256 `5209af0eb334daa1fd79461aa427213d75ea39c09e6cc2bc7b72abf9937bf323`
- `apps/backend/src/modules/dictionaries/interface/http/text-selection.routes.ts`: SHA256 `70388941d0f09b018b7a48f3c7a7fec48c1764f0fe7b3462cb2eb3e1107592cb`
- `apps/backend/src/modules/texts/interface/http/texts-job.routes.ts`: SHA256 `106e3312670d26e10ff919a4624ca387262d2ac3001de8d13b893b1915d96ce7`
- `apps/backend/src/modules/texts/interface/http/text-content.routes.ts`: SHA256 `0b9d2edf36f526af609f403c33c5605874cdce311f6b2ef99e72b3ea07a3c620`

Inspected acceptance/plan/evidence and ADR constraints, contracts and segmentation/selection domain, content/proposal/source-authority persistence paths, AI and selection admission/claim/lease/heartbeat/settlement/commit paths, provider boundary, runtime composition, shared capacity/readiness changes, account deletion integration, route composition, and mapped verification coverage. Existing author test evidence was reused rather than rerunning disposable database suites. Reported test counts are evidence context, not a correctness argument. No paid model or network calls were made.

## CR-02 — High — OPTIONS middleware intercepts unrelated routes

Location: `apps/backend/src/modules/dictionaries/interface/http/text-selection.routes.ts:69` and root mounting at `apps/backend/src/app.ts:127`.

The new module uses `app.use('*', ...)` and is mounted at `/` ahead of Texts content, dictionary, and user routes. Its OPTIONS branch therefore responds to those routes before their own CORS handling. It advertises only GET/POST/OPTIONS and `Authorization, Content-Type, X-Text-Share-Key`. Browser PATCH/PUT/DELETE operations on these modules fail preflight, and the Texts public capability header `X-Languon-Share-Key` is absent.

Read-only reproduction: instantiate `createApp({ textSelections: createTextSelectionRoutes(stubs) })`; issue OPTIONS `/users/me` with Origin localhost:3000 and requested method PATCH. Actual: 204 with `Access-Control-Allow-Methods: GET, POST, OPTIONS` and the selection-only allowed headers. This is a regression in existing app behavior and prevents the new Texts capability from being browser usable.

Fix: constrain module middleware to its owned route namespace/endpoints. Audit all three new route modules, because their wildcard middleware is flattened into the parent app. Preserve path-specific Texts AI/content CORS handling.

Closure evidence: full `createApp` composition tests for selection, Texts AI/content and existing later routes; PATCH folder/profile, PUT text, DELETE share, public share-header preflight. Assert methods/headers and that unrelated OPTIONS does not run selection policy. Status: **Closed after bounded remediation review; see closure evidence below**.

## CR-03 — High — selection body limit and rate limiter leak to other APIs

Location: `apps/backend/src/modules/dictionaries/interface/http/text-selection.routes.ts:79` and `:96`.

The same root-mounted wildcard makes the selection module's 16,384-byte body limit apply to every subsequently mounted API. A valid Texts source may contain 20,000 Unicode code points, so valid source saves below that product bound fail with 413 before reaching the content route. Larger dictionary requests are also affected. In addition, unrelated requests consume the selection limiter; ordinary Texts/dictionary/user traffic can exhaust selection quota and be denied by the wrong domain.

Read-only reproduction: the same composed app receives POST `/texts` with JSON containing 17,000 ASCII source characters. Actual: 413 `{error:{code:'invalid_request',message:'Request too large',...}}` from the selection module before destination routing. This establishes the interception independently of database/auth fixtures.

Fix: scope all selection middleware to selection endpoints and scope both other new modules' middleware to their own routes. Keep route-appropriate body ceilings and rate accounting.

Closure evidence: composed-app tests save an authenticated, schema-valid >16KB text through the actual content route; verify no selection limiter consumption for content/dictionary/profile traffic and preserve the selection endpoint's own size limit and quota. Status: **Closed after bounded remediation review; see closure evidence below**.

## CR-01 — Medium — duplicate ADR number (closed during review)

The initial new Texts ADR reused ADR-0034, already assigned to accepted speech model adapter registration. Root requires the next unused number; duplicate IDs make indexed constraints and references ambiguous. The author renamed the Texts record to ADR-0035 and updated references/index/relationship metadata. Reviewed the new frontmatter/title and index preserving speech ADR-0034. Status: **Closed**.

## Remaining verification and acceptance limits

The initial coverage gap is addressed by composed-app regression cases. No frontend/fidelity completion is claimed; AC10 remains deferred. This correctness verdict concerns the backend checkpoint, not final feature completion. The separate security review has reported SEC-01 closed.

## Bounded remediation review — CR-02 and CR-03 closure

Reviewed on 2026-10-15 after the author reported the registered runner passing all five real PostgreSQL/Redis journeys at 09:58:10 UTC, affected lint passing, and AI HTTP units passing (3). Reused that focused execution evidence after inspecting the actual test bodies and composition; no redundant disposable-infrastructure rerun was needed.

All three new modules now guard each header/body/rate middleware with owned-path matching. OPTIONS handlers are registered only on those owned paths and precede rate/body processing. The selection path boundary distinguishes `/dictionaries/text-selections` and its descendants from other dictionary routes. The content route allows the contract-compatible body ceiling without the selection ceiling preceding it. The actual public header `X-Languon-Share-Key` is now advertised and forwarded. The existing dictionary/profile implementations are included in the journey's real `createApp` composition.

Inspected regression assertions cover PATCH folder/dictionary/profile, PUT text, DELETE share, AI/selection preflight, public share headers, forbidden origins returning 403 without origin allowance, unchanged selection limiter counts for OPTIONS/unrelated traffic, successful actual content persistence of 17,000 ASCII and 20,000 Unicode characters, and actual shared-source selection. The selection route retains its own limit and limiter. No immediate regression was found in the remediated surface.

Independent read-only reproduction against the remediated root composition with a selection limiter that throws if called: OPTIONS `/users/me` now reaches ordinary missing-route response 404 instead of selection 204; POST `/texts` with 17,000 ASCII characters now reaches ordinary 404 instead of selection 413; OPTIONS `/dictionaries/text-selections` still returns its proper 204/GET,POST,OPTIONS. No leaked selection limiter invocation occurred. This independently confirms namespace isolation; the database-backed actual-route tests establish successful destination behavior.

Reviewed remediation state (SHA256):

- app.ts: `5209af0eb334daa1fd79461aa427213d75ea39c09e6cc2bc7b72abf9937bf323`
- text-selection.routes.ts: `29dcae731e36e5f7f7038f157d971139454fd747f3b9327ea7b0b79bb8052f15`
- texts-job.routes.ts: `03a81057790c8a6abeac01c4c7c11fea6c4fc95f64a8990935ef32603c146c5f`
- text-content.routes.ts: `f4a1c5302638d61744fc275c71229d3bbc00a98378e9679258c49c4621dc1fde`
- tests/integration/modules/texts/texts.journeys.test.ts: `1fbd7665b947bb38da159d1b106cf55bd01a36a56b56192509d1d30e1b47699f`

Disposition: CR-02 **Closed**, CR-03 **Closed**. Backend correctness checkpoint **approved**; frontend implementation and its real-browser/fidelity acceptance remain outside this checkpoint.
