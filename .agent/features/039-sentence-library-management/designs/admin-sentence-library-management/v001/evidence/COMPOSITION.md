# Administrative library composition

The user authorized local design on 2026-10-07. The frozen v001 administrative
brief is the scope reference; there is no claimed Magic Patterns admin artifact.

The existing user detail page gains a themed library card: title and explanation,
summary counts, dictionary discovery, labelled responsive filters, selection
controls, sentence rows and cursor navigation. Desktop filters use three columns;
narrow layouts use one column and wrap row/actions without document overflow.
The user-page grid now permits its cards to shrink, preserving the credit table's
existing internal horizontal scrolling rather than widening the entire document.

The drawer groups source/reference, dictionary mappings, additional contextual
hints and availability metadata. Reasoned mutation dialogs use existing Ant Design
primitives. Permanent deletion has a separate explicit confirmation. Server
recent-authentication, conflict, expiry and busy errors retain recovery actions;
uncertain requests replay the same body/operation identity. Decorative icons do
not alter the accessible action names.

Real browser evidence covers preview, archive/restore on behalf of a user,
global archive/restore, reload persistence, mobile containment and guarded
creator-archived deletion. Focused tests cover API validation, frozen selection,
reason/confirmation, uncertain retries and recoverable failures. The real backend
checkpoint independently proves authorization, busy/recent-authentication guards,
atomic audit and content erasure; screenshots do not replace those checks.

Primary wide-dark and narrow preview images are viewport captures (1280×720 /
390×844). Mobile panel top/bottom captures preserve the real header; full-page
list captures are supplemental. Final business suite passes 9/9, including
existing account lifecycle and passkey flows. Supported target-state guards
and lazy Manage discovery avoid unrelated background requests.
