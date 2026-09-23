import { dictionaryApi } from '@/fsd/entities/dictionary';
import type { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';
import type {
    DictionaryLifecycle,
    DictionaryResponse,
} from '@languon/contracts';
import { useMutation } from '@tanstack/react-query';

import type { useEditorQueries } from './use-editor-queries';
import type { useEditorState } from './use-editor-state';

export function useDictionaryMutations({
    t,
    queryClient,
    setOutcome,
    dictionaryId,
    requestWithSession,
    dictionary,
}: Pick<
    ReturnType<typeof useEditorState>,
    't' | 'queryClient' | 'setOutcome' | 'dictionaryId' | 'requestWithSession'
> &
    Pick<ReturnType<typeof useEditorQueries>, 'dictionary'>) {
    const updateSettings = useMutation({
        mutationFn: async (
            values: Parameters<
                typeof DictionarySettingsForm
            >[0]['onSave'] extends (value: infer V) => unknown
                ? V
                : never,
        ) => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            const response = await requestWithSession((token) =>
                dictionaryApi.updateDictionary(token, dictionaryId, {
                    ...values,
                    expectedDictionaryVersion: current.version,
                    expectedSettingsVersion: current.settings.version,
                }),
            );
            queryClient.setQueryData(['dictionary', dictionaryId], response);
            await Promise.all([
                queryClient.invalidateQueries({
                    queryKey: ['dictionary-cards', dictionaryId],
                }),
                queryClient.invalidateQueries({ queryKey: ['dictionaries'] }),
            ]);
        },
    });

    const lifecycle = useMutation({
        mutationFn: async (next: DictionaryLifecycle) => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            return requestWithSession((token) =>
                dictionaryApi.setDictionaryLifecycle(
                    token,
                    dictionaryId,
                    next,
                    {
                        expectedDictionaryVersion: current.version,
                    },
                ),
            );
        },
        onSuccess: (response, next) => {
            queryClient.setQueryData(['dictionary', dictionaryId], response);
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            setOutcome(
                next === 'archived'
                    ? t('dictionary.library.archivedOutcome')
                    : t('dictionary.library.restoredOutcome'),
            );
        },
    });

    const share = useMutation({
        mutationFn: async (operation: 'revoke' | 'rotate') => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            if (operation === 'rotate') {
                return requestWithSession((token) =>
                    dictionaryApi.rotateShareKey(token, dictionaryId, {
                        expectedDictionaryVersion: current.version,
                    }),
                );
            }
            const response = await requestWithSession((token) =>
                dictionaryApi.updateDictionary(token, dictionaryId, {
                    expectedDictionaryVersion: current.version,
                    visibility: 'private',
                }),
            );
            return { capability: null, dictionary: response.dictionary };
        },
        onSuccess: (response) => {
            queryClient.setQueryData<DictionaryResponse>(
                ['dictionary', dictionaryId],
                { dictionary: response.dictionary },
            );
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
        },
    });

    return { updateSettings, lifecycle, share };
}
