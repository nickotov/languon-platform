# Synthetic read-only probe

Initial brief — `import-v3`

Source: supplied synthetic snapshot `import-v3`; no repository or working-tree inspection. Acceptance references: AC-1 and AC-2. `import.test.ts` contains size-validation and owner-restriction coverage, but no executed results were supplied. Output: response only.

Copyable Magic Patterns prompt:

```text
Create a design for Languon’s existing dictionary import experience.

APP CONTEXT
Languon helps language learners manage vocabulary. This experience lets a dictionary owner upload a CSV and understand the import outcome.

FEATURE AND JOURNEY
UI-01: Start from the existing Dictionary navigation entry. Make CSV import discoverable within the dictionary context, including when the dictionary is empty or populated. Do not invent other dictionary functionality.

UI-02: Let the owner select and submit a CSV file up to 2 MB. Explain the format and size limit before submission. Include file selection, submission pending, and oversized-file validation states. The CSV column schema is not supplied: do not invent required headers, sample templates, or column mapping.

UI-03: Import is available only to dictionary owners. Include the non-owner permission state without an actionable import control. Whether to hide the control or show it disabled with an explanation is a UX recommendation to explore, not an established product rule.

UI-04: An accepted upload is queued, not completed. Show distinct queued and running states using text status and indeterminate activity feedback. The system provides a job identifier for tracking, but displaying that technical identifier is not required. Do not show percentages, estimated completion times, or optimistic success.

UI-05: Show success only when the import succeeds, and display the imported count only then. Include a failed state. Failures supply a sanitized failure code, but approved user-facing explanations are not supplied. Clearly label proposed explanatory copy for review; do not invent failure causes or recovery operations.

UI-06: Support mobile layouts and keyboard access. Give file selection and submission clear accessible labels, visible focus, understandable validation, and accessible status announcements. Preserve a usable focus position during asynchronous updates.

UX DIRECTION — RECOMMENDATIONS
UI-07: Explore a compact import region with one clear primary action, nearby format/size guidance, and a persistent status region. Keep the selected-file context visible where useful. Prioritize legibility and touch usability on narrow screens. These layout choices are recommendations, not additional product rules.

DESIGN SYSTEM
UI-08: Use the existing Languon Magic Patterns design system:
[REQUIRED REFERENCE: insert design-system link/access and relevant existing screens]
Its identity and contents have not been supplied or inspected. Preserve its components, tokens, typography, and interaction patterns once available. Supported flow exploration may proceed, but visual fidelity remains unverified until this reference is available.

BOUNDARIES
UI-09: Do not add cancel, retry, undo, batch delete, search, percentage progress, or invented recovery actions. Cancellation is only an unapproved future idea. Do not fabricate successful operations. Do not invent a CSV schema, localization policy, upload-error taxonomy, or additional dictionary controls. Identify unresolved requirements explicitly.

DELIVERABLES
Provide a coherent import experience with empty/populated dictionary entry contexts, file selection, submission pending, size validation, non-owner permission state, queued, running, succeeded-with-count, and failed variants.
Use synthetic example data only. Map every designed section and state to UI-01 through UI-09. List outstanding gaps and any deviations explicitly.
```

Companion checklist:

| ID | Classification | Requirement and source | Relevant states | Proposed verification |
|---|---|---|---|---|
| UI-01 | Supported requirement | Reach import through Dictionary; AC-1, supplied navigation | Empty/populated entry contexts | Design coverage; later browser observation of entry and navigation |
| UI-02 | Supported requirement | Select/upload CSV up to 2 MB; AC-1, implemented handler | Selection, submitting, size rejection | Inspect guidance and validation; execute size tests and browser upload checks |
| UI-03 | Supported requirement | Only owners may import; AC-2, handler, `import.test.ts` | Owner/non-owner | Inspect permission variant; execute permission tests and runtime checks |
| UI-04 | Supported requirement | Accepted upload returns job ID and queued; status supports queued/running | Submission accepted, queued, running | Check status variants; later verify real asynchronous transitions |
| UI-05 | Supported requirement | Succeeded shows imported count; failed provides sanitized code | Success/failure | Check count appears only on success; verify runtime outcomes and reviewed failure copy |
| UI-06 | Supported requirement | Mobile and keyboard access; supplied task requirement | All applicable states | Real narrow-screen and keyboard checks; assess labels, focus, validation and announcements |
| UI-07 | UX recommendation | Compact grouping, primary action, persistent status; design proposal | Entry through outcome | Review hierarchy and usability without expanding behavior |
| UI-08 | Open decision / unsupported | Existing design-system reference unavailable | All visual states | Obtain reference, then compare components and tokens; no fidelity claim yet |
| UI-09 | Open decision / unsupported | Unsupported controls excluded; cancellation note unapproved | Recovery and future actions | Audit designs for invented controls or promises; resolve any requested expansion separately |

Before treating the brief as design-ready: supply the design-system reference and clarify CSV guidance, failure-code wording, and submission-error behavior. Localization requirements are unspecified. These gaps do not prevent exploration of the supported journey.

Delta brief — `import-v4`

Source: supplied correction `import-v4` now rejects duplicate active uploads with a conflict; all other facts remain unchanged. No new test coverage or execution evidence was supplied.

Preserve UI-01–UI-09. Add UI-10; no IDs are removed or superseded.

| ID | Classification | Requirement and source | Relevant states | Proposed verification |
|---|---|---|---|---|
| UI-10 | Supported requirement | Reject a duplicate active upload and explain that it was not accepted; supplied `import-v4` correction, AC-1 context | Submission conflict | Design conflict variant; later execute a duplicate-active-upload check and observe the rendered response |

Copyable delta prompt:

```text
Update the existing Languon dictionary import design. Preserve UI-01 through UI-09 and all existing supported behavior.

Add UI-10: A duplicate active upload is rejected. Include a submission-conflict variant that clearly says this upload was not accepted because a duplicate import is already active. Do not present it as a newly queued job or as a failed previously accepted import.

The conflict does not establish an existing-job identifier, a navigation target, or cancellation/retry capability. Do not invent those controls, a completion estimate, or a duplicate-detection rule. If existing status is already available in the current view, preserve that context without claiming additional data.

Return the changed state and its UI-10 coverage mapping. Keep the existing design-system reference gap explicit.
```

If asked only to refactor the import parser with unchanged behavior and no design request, I would not invoke `design-brief` or produce a design update. I would follow the applicable engineering workflow and verify that the parser’s observable contract remains unchanged; a confirmed invisible refactor leaves these UI requirements intact.
