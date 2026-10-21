import type { CreateDictionaryRequest } from '@languon/contracts';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
} from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    type ChangeEvent,
    type FormEvent,
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    dictionaryApi,
    type RequestWithSession,
} from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { useSessionStore } from '@/fsd/entities/session';

import { retainIdempotencyAttempt } from '../lib/idempotency-attempt';

export function useDictionaryNavigation(
    requestWithSession: RequestWithSession,
    loadList = true,
) {
    const { href } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const userId = useSessionStore((state) =>
        state.status === 'authenticated' ? (state.user?.id ?? null) : null,
    );
    const enabled = userId !== null;
    const createAttempt = useRef<{ fingerprint: string; key: string } | null>(
        null,
    );
    const [createOpen, setCreateOpen] = useState(false);
    const [createSourceLanguage, setCreateSourceLanguage] =
        useState<CreateDictionaryRequest['sourceLanguage']>('en');
    const [createTargetLanguage, setCreateTargetLanguage] =
        useState<CreateDictionaryRequest['targetLanguage']>('es');

    const languages = useQuery({
        enabled,
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const dictionaries = useInfiniteQuery({
        enabled: enabled && loadList,
        queryKey: ['dictionaries-navigation', 'active', userId],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            requestWithSession((token) => {
                if (!isCurrentUser(userId))
                    throw new Error('Dictionary navigation session changed');
                return dictionaryApi.listDictionaries(
                    token,
                    {
                        lifecycle: 'active',
                        limit: 100,
                        ...(pageParam ? { cursor: pageParam } : {}),
                    },
                    signal,
                );
            }),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = dictionaries;

    useEffect(() => {
        if (!enabled || !loadList || !hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
    }, [enabled, loadList, fetchNextPage, hasNextPage, isFetchingNextPage]);

    useEffect(() => {
        setCreateOpen(false);
        createAttempt.current = null;
        return () => {
            if (userId)
                void queryClient.cancelQueries({
                    queryKey: ['dictionaries-navigation', 'active', userId],
                });
        };
    }, [userId, queryClient]);

    const create = useMutation({
        mutationFn: ({
            body,
            ownerId,
        }: {
            body: CreateDictionaryRequest;
            ownerId: string;
        }) => {
            if (!isCurrentUser(ownerId))
                throw new Error('Dictionary navigation session changed');
            const fingerprint = JSON.stringify(body);
            createAttempt.current = retainIdempotencyAttempt(
                createAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) => {
                if (!isCurrentUser(ownerId))
                    throw new Error('Dictionary navigation session changed');
                return dictionaryApi.createDictionary(
                    token,
                    body,
                    createAttempt.current!.key,
                );
            });
        },
        onSuccess: ({ dictionary }, { ownerId }) => {
            if (!isCurrentUser(ownerId)) return;
            createAttempt.current = null;
            setCreateOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['dictionaries'] });
            void queryClient.invalidateQueries({
                queryKey: ['dictionaries-navigation'],
            });
            router.push(href(`/dictionaries/${dictionary.id}`));
        },
    });

    function submitCreate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!userId || !isCurrentUser(userId)) return;
        const data = new FormData(event.currentTarget);
        create.mutate({
            ownerId: userId,
            body: {
                description:
                    String(data.get('description') ?? '').trim() || null,
                name: String(data.get('name') ?? ''),
                sourceLanguage: String(
                    data.get('sourceLanguage') ?? '',
                ) as CreateDictionaryRequest['sourceLanguage'],
                targetLanguage: String(
                    data.get('targetLanguage') ?? '',
                ) as CreateDictionaryRequest['targetLanguage'],
            },
        });
    }

    useEffect(() => {
        create.reset();
        setCreateSourceLanguage('en');
        setCreateTargetLanguage('es');
    }, [userId, create.reset]);

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
        if (!isCurrentUser(userId)) return;
        void languages.refetch();
        void dictionaries.refetch();
    }

    const list = enabled
        ? (dictionaries.data?.pages.flatMap((page) => page.data) ?? [])
        : [];
    const loadError =
        languages.error ?? (dictionaries.data ? null : dictionaries.error);

    return {
        catalog: languages.data?.languages ?? [],
        changeSource,
        changeTarget,
        closeCreate: () => setCreateOpen(false),
        create,
        createOpen: enabled && createOpen,
        createSourceLanguage,
        createTargetLanguage,
        dictionaries,
        list,
        loadError,
        openCreate: () => {
            if (isCurrentUser(userId)) setCreateOpen(true);
        },
        pending: dictionaries.isPending || languages.isPending,
        retryLoad,
        submitCreate,
    };
}

function isCurrentUser(ownerId: string | null) {
    const state = useSessionStore.getState();
    return (
        ownerId !== null &&
        state.status === 'authenticated' &&
        state.user?.id === ownerId
    );
}

export type DictionaryNavigationState = ReturnType<
    typeof useDictionaryNavigation
>;
