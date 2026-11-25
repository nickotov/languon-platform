# Conversation native call reservation

Status: Complete (scoped fix verified)

The conversation worker accepted three listening requests but PostgreSQL rejected the first model call of each turn with “Native calls exceed parent envelope”. No outbound native receipt was created. Tutor accounting measured only prompt and tools. Native authorization also measured the response format and a 256-byte allowance. The conversation notice fell back to the conversation-loading message for the stored failure code.

Use one conservative input bound at reservation and dispatch. Keep SQL authority, observed usage, model selection, and retry policy intact. Render generation-specific guidance for the existing failed-turn code. Scope is a correction to existing paths.

Verification planned: focused accounted tutor and native catalog tests, including a structured request and an actual receipt guard (minutes), targeted backend/web typechecks, rendered notice, configuration doctor before and after. No live paid provider call in the automated suite. Baseline local knowledge-actions configuration doctor ready.

The same byte-bound function now sizes the tutor reservation, the structured-call projection and the native gateway call. The learner interview also uses this gate. Its admission projection now includes the SDK timestamp on the user message. Removed the unused tutor estimator override. The database admission and settlement functions are unchanged.

Production regression used a disposable PostgreSQL database, the real worker and Mastra SDK, Gemini native pricing, and synthetic HTTP. With the original tutor gate, the database rejected the call with the reported error. With the corrected gate, a four-part lesson completed with durable observed receipts within the parent reservations and no outstanding holds. Five selected production cases passed. The gateway/tutor/projection selections passed, including an explicit response-format reservation check. All 21 listening/source/recording checks, 23 interview checks and 13 chat notice tests passed. Russian failure guidance and the retry button were verified in a browser. Both app typechecks, scoped lint, guide validation and mapping checks passed. The local development worker reloaded and its runtime knowledge-action readiness passed.

Independent review found no material financial or security issues. No learner turns were replayed or account settings changed. Automatic approval review declined the smoke preflight because the configured Gemini route is outside the approved live smoke policy. The live Gemini-to-recording journey was not verified.

The final registered ai-conversation selection passed 601 of 607 tests. Six existing failures remain in lesson activity allocation (two cases), the learning-content registry, source-selection provenance, the batch repair limit, and the customer-quote mixed lesson. Baseline comparisons reproduced these outcomes. The targeted native dispatch, interview, listening and UI checks are green.
