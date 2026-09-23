import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';

import type { GenerationReviewState } from '../../hooks/use-generation-review';
import type { GenerationReviewProps } from '../../model/generation-review';
import styles from '../dictionary-generation-panel/dictionary-generation-panel.module.css';

export function ReviewFooter({
    state,
    pending,
    cancellationRequested,
    onClose,
}: {
    state: GenerationReviewState;
    pending: boolean;
    cancellationRequested: boolean;
    onClose: GenerationReviewProps['onClose'];
}) {
    const { t } = useI18n();
    const closeLabel = t('dictionary.generation.close');
    const discardLabel = t('dictionary.generation.discard');
    const regenerateLabel = t('dictionary.generation.regenerate');
    const acceptLabel = t('dictionary.generation.accept');
    const generateLabel = t('dictionary.generation.start');
    const cancelLabel = cancellationRequested
        ? t('dictionary.generation.cancelling')
        : t('dictionary.generation.cancel');

    return (
        <div className={styles.footer}>
            <Button
                disabled={pending}
                onClick={onClose}
                type='button'
                variant='secondary'
            >
                {closeLabel}
            </Button>
            <div className={styles.footerActions}>
                {state.ready ? (
                    <>
                        <Button
                            disabled={pending}
                            onClick={state.handleDiscard}
                            type='button'
                            variant='secondary'
                        >
                            {discardLabel}
                        </Button>
                        <Button
                            disabled={state.generateDisabled}
                            onClick={state.handleGenerate}
                            type='button'
                            variant='secondary'
                        >
                            <ReviewActionIcon kind='refresh' />
                            {regenerateLabel}
                        </Button>
                        <Button
                            disabled={state.acceptDisabled}
                            loading={pending}
                            onClick={state.handleAccept}
                            type='button'
                        >
                            {acceptLabel}
                        </Button>
                    </>
                ) : state.busy ? (
                    <Button
                        disabled={state.cancelDisabled}
                        loading={pending}
                        onClick={state.handleCancel}
                        type='button'
                        variant='secondary'
                    >
                        {cancelLabel}
                    </Button>
                ) : state.canGenerate ? (
                    <Button
                        disabled={state.generateDisabled}
                        loading={pending}
                        onClick={state.handleGenerate}
                        type='button'
                    >
                        <ReviewActionIcon kind='sparkles' />
                        {generateLabel}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

function ReviewActionIcon({ kind }: { kind: 'refresh' | 'sparkles' }) {
    return (
        <svg
            aria-hidden='true'
            fill='none'
            height='16'
            stroke='currentColor'
            strokeLinecap='round'
            strokeLinejoin='round'
            strokeWidth='2'
            viewBox='0 0 24 24'
            width='16'
        >
            {kind === 'refresh' ? (
                <>
                    <path d='M3 12a9 9 0 0 1 15.36-6.36L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.36 6.36L3 16M8 16H3v5' />
                </>
            ) : (
                <>
                    <path d='m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3ZM5 3v4M3 5h4' />
                </>
            )}
        </svg>
    );
}
