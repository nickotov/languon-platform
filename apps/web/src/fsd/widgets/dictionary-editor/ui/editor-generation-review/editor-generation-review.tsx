import { dictionaryErrorMessage } from '@/fsd/entities/dictionary';
import { DictionaryGenerationPanel } from '@/fsd/features/dictionary-generation';
import { BottomSheet, Button, ErrorState, LoadingState } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import { syncGenerationUrl } from '../../lib/generation-url';

export function EditorGenerationReview({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'generationTarget'
        | 'setGenerationTarget'
        | 'generationCompared'
        | 'setGenerationCompared'
        | 'dictionary'
        | 'cards'
        | 'generationCapabilities'
        | 'generationJob'
        | 'generationCard'
        | 'generationAction'
        | 'current'
        | 'catalog'
        | 'generationConflict'
    >;
}) {
    const {
        t,
        generationTarget,
        setGenerationTarget,
        generationCompared,
        setGenerationCompared,
        dictionary,
        cards,
        generationCapabilities,
        generationJob,
        generationCard,
        generationAction,
        current,
        catalog,
        generationConflict,
    } = model;

    const handleClick: ComponentProps<typeof Button>['onClick'] = () =>
        void generationJob.refetch();

    const availableValue: ComponentProps<
        typeof DictionaryGenerationPanel
    >['available'] =
        generationCapabilities.data?.singleCardGeneration.available === true;

    const currentCardValue: ComponentProps<
        typeof DictionaryGenerationPanel
    >['currentCard'] = generationCompared
        ? generationCard.data?.card
        : undefined;

    function resolveErrorValue() {
        if (generationJob.error || generationAction.error) {
            return dictionaryErrorMessage(
                generationJob.error ?? generationAction.error,
                t,
            );
        }

        return null;
    }

    const errorValue: ComponentProps<
        typeof DictionaryGenerationPanel
    >['error'] = resolveErrorValue();

    const jobValue: ComponentProps<typeof DictionaryGenerationPanel>['job'] =
        generationJob.data?.job ?? undefined;

    const handleAccept: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onAccept'] = async (candidate) => {
        await generationAction.mutateAsync({
            candidate,
            kind: 'accept',
        });
    };

    const handleCancel: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onCancel'] = async () => {
        await generationAction.mutateAsync({
            kind: 'cancel',
        });
    };

    const handleClose: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onClose'] = () => {
        setGenerationTarget(null);

        setGenerationCompared(false);

        syncGenerationUrl(null);

        generationAction.reset();
    };

    const handleDiscard: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onDiscard'] = async () => {
        await generationAction.mutateAsync({
            kind: 'discard',
        });
    };

    const handleRegenerate: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onRegenerate'] = async (instruction) => {
        await generationAction.mutateAsync({
            kind: 'regenerate',
            ...(instruction ? { instruction } : {}),
        });
    };

    const handleReloadCompare: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onReloadCompare'] = async () => {
        await Promise.all([
            dictionary.refetch(),
            cards.refetch(),
            generationCard.refetch(),
        ]);

        setGenerationCompared(true);
    };

    const handleStart: ComponentProps<
        typeof DictionaryGenerationPanel
    >['onStart'] = async (instruction) => {
        await generationAction.mutateAsync({
            kind: 'start',
            ...(instruction ? { instruction } : {}),
        });
    };

    const title = t('dictionary.generation.title');

    const closeLabel = t('common.cancel');

    if (generationTarget && generationJob.isPending) {
        return (
            <BottomSheet
                open
                onClose={handleClose}
                title={title}
                closeLabel={closeLabel}
            >
                <LoadingState>
                    {t('dictionary.generation.loading')}
                </LoadingState>
            </BottomSheet>
        );
    }

    if (generationTarget && generationJob.isError && !generationJob.data) {
        return (
            <BottomSheet
                open
                onClose={handleClose}
                title={title}
                closeLabel={closeLabel}
            >
                <ErrorState
                    action={
                        <Button onClick={handleClick} type='button'>
                            {t('common.retry')}
                        </Button>
                    }
                    title={t('dictionary.generation.loadFailed')}
                >
                    {dictionaryErrorMessage(generationJob.error, t)}
                </ErrorState>
            </BottomSheet>
        );
    }

    if (generationTarget) {
        return (
            <DictionaryGenerationPanel
                available={availableValue}
                card={generationCard.data?.card}
                conflict={generationConflict}
                currentCard={currentCardValue}
                dictionary={current}
                error={errorValue}
                job={jobValue}
                languages={catalog}
                onAccept={handleAccept}
                onCancel={handleCancel}
                onClose={handleClose}
                onDiscard={handleDiscard}
                onRegenerate={handleRegenerate}
                onReloadCompare={handleReloadCompare}
                onStart={handleStart}
                pendingAction={generationAction.isPending}
            />
        );
    }

    return null;
}
