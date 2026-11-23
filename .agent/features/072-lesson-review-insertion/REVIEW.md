# Review

## First implementation (superseded)

These notes describe the former modal implementation. Current behavior and verification are recorded in the workspace-panel revision below.

The design brief selected the existing accessible responsive dialog, document renderer, one shared placement choice and sustained focus after insertion. Security review covers owner/source authorization, selection against the stored proposal, dependency remapping and durable replay behavior.

Security review approved the final owner-scoped exact proposal lookup, completed-run query, copy command, dependency closure, transactional receipt, branch version check and media validation. Replaying a successful operation returns the current branch; the UI reconciles the returned state.

Independent source review found that a stale tab could repeatedly post the rejected branch version. The fix performs one bounded read, fences further insertion at that version, and offers a read-only Refresh draft action if reconciliation fails. Shared workspace reconciliation preserves dirty edits, in-flight saves and newer local versions. The reviewer closed the finding after checking the regression tests. The visual review approved both captured viewport sizes.

Final verification closed the renderer observation gap for the two recovery notices. The designer and independent reviewer found no outstanding material issue. Exact replay reconciles the current working branch. The two unrelated local CSS edits are excluded from this feature.

## Current workspace-panel revision

The earlier modal review above describes the first implementation. The revised design uses the AI panel and the real Knowledge editor. Independent review identified two persistence regressions. Reusing a removed exercise ID could associate the new exercise with its old practice attempts. Reusing a previously copied source by ID alone could associate an exercise with a source the author had since edited. New insertion operations allocate fresh block IDs and validate source content before reuse. Durable request receipts still protect retries. Logical-part provenance identifies existing material across edits and reloads. The UI designer also identified misleading reference-answer labels and a Send tooltip escaping the hidden chat. Both were corrected.

All five independent source findings were resolved. CR-072-01 covers fresh practice identities. CR-072-02 checks captured source contents before reuse. CR-072-03 rejects provenance supplied by model outputs. CR-072-04 retains strict document validation for a horizontal rule with empty attributes. CR-072-05 separates authoring validation from persisted prose classification so inserted readings remain editable. The independent reviewer checked the fixes and the focused contract, database and client results. Security review found no material change to access authority. The designer approved the rendered desktop, exercise disclosure and mobile states. The mobile bulk actions stay visible and disabled once all parts are present.
