# Generate listening lessons from the original chat request

Status: Complete.

An owner can ask for a recording and a listening exercise as one Knowledge chat message. The previous flow quoted the message before it knew that the plan included speech, then stopped and told the user to change a composer setting and repeat the same request.

- AC-1. In an owned Knowledge note a typed request for a short French dialogue about a previously generated reading and one comprehension question produces a listening set from one submission.
- AC-2. Explicit references and selected passages take precedence. A single applicable prior generated reading is usable before insertion. When several readings could satisfy a reference, let the user select by title while preserving the request.
- AC-3. Use an existing recording for a reuse request. Explaining an activity requires no synthesis. New speech requires bounded owner authority. Allow zero-cost eligible work to proceed and honor a previously accepted applicable ceiling. An additional approval for uncovered paid work stays attached to the plan. Replay, navigation and duplicate clicks cannot duplicate charges.
- AC-4. Show clear in-chat progress and recoverable, specific errors. The player, exercise and document insertion controls continue to share a single preview. Support keyboard and small screens.
- AC-5. An interrupted plan preserves its source and prepared audio. Stop cancels pending dispatch; changing branches or losing access invalidates stale authority.

The Knowledge workspace user-flow guide and architecture viewer cover the changed journey. The speech provider and available activity catalog remain governed by ADR-0065.
