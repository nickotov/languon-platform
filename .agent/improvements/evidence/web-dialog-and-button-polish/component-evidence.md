# Focused component evidence

Worker attestations returned2026-11-11 from their actual CLI results. These are
not raw machine reports; no saved worker log files existed. Root retained raw
logs for shared tests and final static/browser/build gates separately. No test
was rerun to manufacture a report.

- utility_button_polish: `pnpm --filter @languon/web exec vitest run tests/flashcard-training-manual-selection.test.tsx tests/conversation-history-rename.test.tsx tests/shared-knowledge-assistant-actions.test.tsx tests/credit-balance.test.tsx` selected22 unique cases,19initialpasses/3stale-fixture failures. After reproduced baseline and canonical fixture repair, exact assistant-action file rerun5/5;17unchanged othercases+5final=22unique passing.
- raw_icon_tooltip_polish: `pnpm --filter @languon/web exec vitest run tests/auth-forms.test.tsx tests/knowledge-block-mentions.test.tsx tests/knowledge-workspace-block-selection.test.tsx`:3files27tests pass,13.55s. Scoped lint passes after whitespace-only fix.
- custom_dialog_footer_polish: `pnpm --filter @languon/web exec vitest run tests/dictionary-library.test.tsx tests/flashcard-training-setup.test.tsx tests/flashcard-training-interactions.test.tsx tests/knowledge-learning-block-editor.test.tsx tests/knowledge-block-proposals.test.tsx tests/knowledge-proposal-refresh.test.tsx tests/dictionary-generation.test.tsx tests/sentence-training-ui.test.tsx tests/sentence-training-review-regressions.test.tsx`:93/94initialpasses,151.97s with editor timeout/resource contention. Isolated `tests/knowledge-learning-block-editor.test.tsx --maxWorkers=1`15/15,27.23s;79unchanged+15final=94unique passing.
- Additional `pnpm --filter @languon/web exec vitest run tests/knowledge-library-copy.test.tsx tests/knowledge-block-copy.test.tsx --maxWorkers=1`:12/12,5.48s.
- web_button_polish_audit: `pnpm --filter @languon/web exec vitest run tests/dictionary-card-authoring.test.tsx tests/dictionary-batch-generation.test.tsx tests/dictionary-document-generation-panel.test.tsx --maxWorkers=1`:3files97tests pass,11.00s. Root final scoped ESLint covers these files too.
- Root `pnpm --filter @languon/web exec vitest run tests/ui-kit.test.tsx`:29/29,2.52s; raw /private/tmp/languon-dialog-kit-tests-final.log.

Total281unique passing component cases. Superseded failed runs are retained as
history; no timeout increases, skipped cases or removed assertions.
