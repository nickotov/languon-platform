import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { DictionaryGenerationCandidate } from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';
import { syncGenerationUrl } from '../lib/generation-url';
import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';
import type { useGenerationJob } from './use-generation-job';

export function useGenerationMutation({
    t,
    queryClient,
    generationTarget,
    setGenerationTarget,
    setOutcome,
    dictionaryId,
    requestWithSession,
    dictionary,
    generationJob,
}: Pick<
    ReturnType<typeof useEditorState>,
    | 't'
    | 'queryClient'
    | 'generationTarget'
    | 'setGenerationTarget'
    | 'setOutcome'
    | 'dictionaryId'
    | 'requestWithSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'dictionary'> &
    Pick<ReturnType<typeof useGenerationJob>, 'generationJob'>) {
    const generationAction = useMutation({
        mutationFn: async (
            action:
                | { kind: 'accept'; candidate: DictionaryGenerationCandidate }
                | { kind: 'cancel' }
                | { kind: 'discard' }
                | { kind: 'regenerate' | 'start'; instruction?: string },
        ) => {
            const currentDictionary = dictionary.data?.dictionary;
            if (!generationTarget || !currentDictionary)
                throw new Error('Dictionary generation unavailable');
            if (action.kind === 'cancel') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.cancelGenerationJob(token, jobId),
                );
            }
            if (action.kind === 'discard') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.discardGenerationJob(token, jobId),
                );
            }
            if (action.kind === 'accept') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.acceptGenerationJob(token, jobId, {
                        candidate: action.candidate,
                    }),
                );
            }
            const currentCardResponse = await requestWithSession((token) =>
                dictionaryApi.readCard(
                    token,
                    dictionaryId,
                    generationTarget.cardId,
                ),
            );
            const currentCard = currentCardResponse.card;
            const body = {
                expectedCardVersion: currentCard.version,
                expectedDictionaryVersion:
                    currentCardResponse.dictionaryVersion,
                expectedSettingsVersion: currentCard.settingsVersion,
                instruction:
                    'instruction' in action
                        ? (action.instruction ?? null)
                        : null,
            };
            if (action.kind === 'regenerate') {
                const jobId = generationJob.data?.job?.id;
                if (!jobId) throw new Error('Generation job unavailable');
                return requestWithSession((token) =>
                    dictionaryApi.regenerateGenerationJob(
                        token,
                        jobId,
                        body,
                        crypto.randomUUID(),
                    ),
                );
            }
            return requestWithSession((token) =>
                dictionaryApi.enqueueCardGeneration(
                    token,
                    dictionaryId,
                    currentCard.id,
                    body,
                    crypto.randomUUID(),
                ),
            );
        },
        onSuccess: async (response) => {
            if (response.job.kind !== 'single-card') return;
            const cardId = response.job.cardId;
            const nextTarget = { cardId, jobId: response.job.id };
            setGenerationTarget(nextTarget);
            syncGenerationUrl(nextTarget);
            queryClient.setQueryData(
                [
                    'dictionary-generation-job',
                    dictionaryId,
                    cardId,
                    response.job.id,
                ],
                { job: response.job },
            );
            if (response.job.state === 'accepted') {
                setOutcome(t('dictionary.generation.state.accepted'));
                await Promise.all([
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary-cards', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionary', dictionaryId],
                    }),
                    queryClient.invalidateQueries({
                        queryKey: ['dictionaries'],
                    }),
                ]);
            }
        },
    });

    return { generationAction };
}
