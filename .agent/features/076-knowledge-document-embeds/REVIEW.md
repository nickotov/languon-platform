# Knowledge document embed review

## Source and threat review

Independent reviewer traced AC-1 through AC-5 on the feature diff against `0456c642` including untracked source. Their initial tracked patch SHA-256 was `a79ce2141b05ada79fef3c0d94172a771e1c5f5cead0dd6fb27f9aaa75471d18`. Review covered validation, target mapping, model projections, editor and reader behavior, persistence and guide coverage.

- R-1 (low), picker and dialog interaction coverage. Successful insertion and YouTube playback had coverage. Cancellation, correcting an invalid URL at the same cursor position, and the YouTube search alias needed explicit verification. Fixed with three passing interaction tests in E6.
- Independent security reviewer found no material defects after the final browser run. Review included hash-pinned bootstrap, opaque outer origin, scriptless nested frame, source-specific CSP, click-to-load, external links, document validation, copy and model boundaries.
- UI reviewer inspected desktop and mobile full-stack screenshots plus the phone Storybook image and found no material layout defects.

## Operational boundaries

Third-party hosts see normal browser request metadata after activation. The inner frame requests credentialless mode on supporting browsers. Direct image loads use browser policies. Sites can refuse framing, require scripts or redirect to another origin; the document always offers the original link. Moving website content into or out of the dialog reloads the frame.

Final verdict: **Approved**. The independent reviewer approved the source and final evidence after inspecting E6. The reviewed tracked patch SHA-256 was `6bab6699d36e0d00ce989a869a1baad56de34261d9a55121e54b2253abdf5ee9`.
