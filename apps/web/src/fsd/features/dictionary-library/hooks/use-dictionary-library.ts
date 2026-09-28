import type {
    CreateDictionaryRequest,
    DictionaryLifecycle,
} from '@languon/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import {
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { retainIdempotencyAttempt } from '../lib/idempotency-attempt';
import { useDictionaryLibraryDeletion } from './use-dictionary-library-deletion';
import { useLibraryQueries } from './use-library-queries';

export function useDictionaryLibrary(requestWithSession: RequestWithSession) {
    const { href, t } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [lifecycle, setLifecycle] = useState<DictionaryLifecycle>('active');
    const [createOpen, setCreateOpen] = useState(false);
    const [createSourceLanguage, setCreateSourceLanguage] =
        useState<CreateDictionaryRequest['sourceLanguage']>('en');
    const [createTargetLanguage, setCreateTargetLanguage] =
        useState<CreateDictionaryRequest['targetLanguage']>('es');
    const [message, setMessage] = useState<string | null>(null);
    const createAttempt = useRef<{ fingerprint: string; key: string } | null>(
        null,
    );

    const { languages, dictionaries } = useLibraryQueries(
        requestWithSession,
        lifecycle,
        search,
    );
    const catalog = languages.data?.languages ?? [];
    const list = dictionaries.data?.pages.flatMap((page) => page.data) ?? [];
    const loadError =
        languages.error ?? (dictionaries.data ? null : dictionaries.error);
    const create = useMutation({
        mutationFn: (body: {
            description: string | null;
            name: string;
            sourceLanguage: string;
            targetLanguage: string;
        }) => {
            const fingerprint = JSON.stringify(body);
            createAttempt.current = retainIdempotencyAttempt(
                createAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.createDictionary(
                    token,
                    body as Parameters<
                        typeof dictionaryApi.createDictionary
                    >[1],
                    createAttempt.current!.key,
                ),
            );
        },
        onSuccess: ({ dictionary }) => {
            createAttempt.current = null;
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            void queryClient.invalidateQueries({
                queryKey: ['dictionaries-navigation'],
            });
            setCreateOpen(false);
            router.push(href(`/dictionaries/${dictionary.id}`));
        },
    });

    const lifecycleMutation = useMutation({
        mutationFn: (input: {
            id: string;
            lifecycle: DictionaryLifecycle;
            version: number;
        }) =>
            requestWithSession((token) =>
                dictionaryApi.setDictionaryLifecycle(
                    token,
                    input.id,
                    input.lifecycle,
                    { expectedDictionaryVersion: input.version },
                ),
            ),
        onSuccess: (_, input) => {
            setMessage(
                input.lifecycle === 'archived'
                    ? t('dictionary.library.archivedOutcome')
                    : t('dictionary.library.restoredOutcome'),
            );
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            void queryClient.invalidateQueries({
                queryKey: ['dictionaries-navigation'],
            });
        },
    });
    const deletion = useDictionaryLibraryDeletion({
        list,
        refetchDictionaries: () => dictionaries.refetch(),
        requestWithSession,
        setMessage,
    });
    function submitCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        create.mutate({
            description: String(data.get('description') ?? '').trim() || null,
            name: String(data.get('name') ?? ''),
            sourceLanguage: String(data.get('sourceLanguage') ?? ''),
            targetLanguage: String(data.get('targetLanguage') ?? ''),
        });
    }

    function openCreate() {
        setCreateOpen(true);
    }
    function closeCreate() {
        setCreateOpen(false);
    }
    function changeSearch(event: ChangeEvent<HTMLInputElement>) {
        deletion.clearSelection();
        setSearch(event.currentTarget.value);
    }
    function clearSearch() {
        deletion.clearSelection();
        setSearch('');
    }
    function selectActive() {
        deletion.clearSelection();
        setLifecycle('active');
    }
    function selectArchived() {
        setLifecycle('archived');
    }
    function switchLifecycle() {
        deletion.clearSelection();
        setLifecycle(lifecycle === 'active' ? 'archived' : 'active');
    }
    function changeSource(event: ChangeEvent<HTMLSelectElement>) {
        setCreateSourceLanguage(
            event.currentTarget
                .value as CreateDictionaryRequest['sourceLanguage'],
        );
    }
    function changeTarget(event: ChangeEvent<HTMLSelectElement>) {
        setCreateTargetLanguage(
            event.currentTarget
                .value as CreateDictionaryRequest['targetLanguage'],
        );
    }
    function retryLoad() {
        void languages.refetch();
        void dictionaries.refetch();
    }
    function loadMore() {
        void dictionaries.fetchNextPage();
    }
    function reloadConflict() {
        lifecycleMutation.reset();
        void dictionaries.refetch();
    }

    return {
        search,
        lifecycle,
        createOpen,
        createSourceLanguage,
        createTargetLanguage,
        message,
        catalog,
        list,
        loadError,
        languages,
        dictionaries,
        create,
        lifecycleMutation,
        ...deletion,
        submitCreate,
        openCreate,
        closeCreate,
        changeSearch,
        clearSearch,
        selectActive,
        selectArchived,
        switchLifecycle,
        changeSource,
        changeTarget,
        retryLoad,
        loadMore,
        reloadConflict,
    };
}

export type LibraryState = ReturnType<typeof useDictionaryLibrary>;
