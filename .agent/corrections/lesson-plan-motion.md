# Lesson plan disclosure and task alignment

Status: Complete

The task list now assigns a CSS module class to each list item and scopes its current-step styling to that row. The row icon uses the two-pixel spacing token.

The native disclosure keeps its content mounted so it can animate to and from its intrinsic height. The current activity summary and chevron transition with the disclosure. The closed body is inert, and the duplicate activity description is hidden from assistive technology when the details are open. Reduced-motion preferences use immediate state changes.

The two focused suites passed 33 tests. The browser journey checks the task icon's computed top margin and samples intermediate rendered heights in both directions. Document commands, persistence and keyboard controls remain the same.

The mapped Chromium journey passed with all four HTTP prerequisites, including both height animations, the computed 2px icon margin and recovery disclosure checks. The Knowledge guide revision is synchronized.
