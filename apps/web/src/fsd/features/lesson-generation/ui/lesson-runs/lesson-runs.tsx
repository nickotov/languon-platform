import type { GenerationRunSummary } from '@languon/contracts';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { lessonRunCopy } from '../../lib/lesson-run-copy';
import { LessonRunQuote } from '../lesson-run-quote/lesson-run-quote';
import type { LessonRunsProps } from './types';
import { LessonRunItem } from '../lesson-run-item/lesson-run-item';

export function LessonRuns({
    runs,
    ...props
}: LessonRunsProps & { runs?: GenerationRunSummary[] }) {
    const { state, reconnecting } = props;
    const { locale } = useI18n();
    const copy = lessonRunCopy(locale);
    const visible = (runs ?? state.runs).filter(
        (run) => run.state !== 'discarded',
    );

    function refresh() {
        void state.refresh();
    }

    function refreshQuote() {
        if (state.actions.action) {
            state.actions.execute(state.actions.action);
        }
    }

    return (
        <>
            {visible.map((run) => (
                <LessonRunItem key={run.id} run={run} {...props} />
            ))}
            {state.isError && (
                <InlineAlert tone='error'>
                    {copy.readFailed}
                    <Button size='compact' variant='ghost' onClick={refresh}>
                        {copy.refresh}
                    </Button>
                </InlineAlert>
            )}
            <LessonRunQuote
                quote={
                    state.actions.action?.kind === 'continue' &&
                    state.actions.action.run.pauseReason ===
                        'recording-confirmation'
                        ? null
                        : state.actions.quote
                }
                revision={state.actions.action?.kind === 'revise'}
                busy={state.actions.pending || reconnecting || state.rechecking}
                onConfirm={state.actions.confirm}
                onRefresh={refreshQuote}
                onClose={state.actions.cancelQuote}
            />
        </>
    );
}
