import type { DictionarySummary } from '@languon/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import type { SaveDictionarySettings } from '@/fsd/features/dictionary-settings';

export function useLibrarySettings(requestWithSession: RequestWithSession) {
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<DictionarySummary | null>(null);
    const dictionaryId = selected?.id ?? '';
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const dictionary = useQuery({
        queryKey: ['dictionary', dictionaryId],
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                dictionaryApi.readDictionary(token, dictionaryId, signal),
            ),
        enabled: Boolean(selected),
    });
    const update = useMutation({
        mutationFn: async (values: SaveDictionarySettings) => {
            const current = dictionary.data?.dictionary;
            if (!current) throw new Error('Dictionary unavailable');
            return requestWithSession((token) =>
                dictionaryApi.updateDictionary(token, current.id, {
                    ...values,
                    expectedDictionaryVersion: current.version,
                    expectedSettingsVersion: current.settings.version,
                }),
            );
        },
        onSuccess: (response) => {
            queryClient.setQueryData(
                ['dictionary', response.dictionary.id],
                response,
            );
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            void queryClient.invalidateQueries({
                queryKey: ['dictionaries-navigation'],
            });
        },
    });

    function open(dictionarySummary: DictionarySummary) {
        update.reset();
        setSelected(dictionarySummary);
    }

    function close() {
        if (update.isPending) return;
        update.reset();
        setSelected(null);
    }

    return {
        close,
        dictionary,
        languages,
        open,
        selected,
        update,
    };
}

export type LibrarySettingsState = ReturnType<typeof useLibrarySettings>;
