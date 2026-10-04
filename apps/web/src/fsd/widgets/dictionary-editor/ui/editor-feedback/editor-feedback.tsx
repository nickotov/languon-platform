import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { Button, ErrorState, InlineAlert } from '@/fsd/shared/ui';
import type { EditorViewFields } from '../../lib/editor-workspace';
import styles from '../dictionary-editor-common.module.css';

export function EditorFeedback({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'conflict'
        | 'mutationError'
        | 'reloadAfterConflict'
        | 'outcome'
        | 'generationCapabilities'
    >;
}) {
    const {
        t,
        conflict,
        mutationError,
        reloadAfterConflict,
        outcome,
        generationCapabilities,
    } = model;

    const message = mutationError
        ? dictionaryErrorMessage(mutationError, t)
        : null;

    const conflictTitle = t('dictionary.conflict.title');

    function reload() {
        void reloadAfterConflict();
    }

    function retryCapabilities() {
        void generationCapabilities.refetch();
    }

    function resolveEditorFeedbackContent() {
        if (conflict) {
            return (
                <ErrorState
                    title={conflictTitle}
                    action={
                        <Button onClick={reload} type='button'>
                            {t('dictionary.conflict.reload')}
                        </Button>
                    }
                >
                    {t('dictionary.conflict.help')}
                </ErrorState>
            );
        }

        if (message) {
            return <p role='alert'>{message}</p>;
        }

        return null;
    }

    const resolvedEditorFeedbackContent = resolveEditorFeedbackContent();

    return (
        <>
            {resolvedEditorFeedbackContent}
            {outcome ? (
                <p aria-live='polite' className={styles.outcome}>
                    {outcome}
                </p>
            ) : null}
            {generationCapabilities.isError ? (
                <InlineAlert tone='warning'>
                    {t('dictionary.generation.capabilityFailed')}
                    <Button
                        onClick={retryCapabilities}
                        size='small'
                        type='button'
                        variant='quiet'
                    >
                        {t('common.retry')}
                    </Button>
                </InlineAlert>
            ) : null}
        </>
    );
}
