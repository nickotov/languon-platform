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

import { retainIdempotencyAttempt } from '../lib/idempotency-attempt';

export function useDictionaryNavigation(
    requestWithSession: RequestWithSession,
) {
    const { href } = useI18n();
    const router = useRouter();
    const queryClient = useQueryClient();
    const createAttempt = useRef<{ fingerprint: string; key: string } | null>(
        null,
    );
    const [createOpen, setCreateOpen] = useState(false);
    const [createSourceLanguage, setCreateSourceLanguage] =
        useState<CreateDictionaryRequest['sourceLanguage']>('en');
    const [createTargetLanguage, setCreateTargetLanguage] =
        useState<CreateDictionaryRequest['targetLanguage']>('es');

    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    const dictionaries = useInfiniteQuery({
        queryKey: ['dictionaries-navigation', 'active'],
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam, signal }) =>
            requestWithSession((token) =>
                dictionaryApi.listDictionaries(
                    token,
                    {
                        lifecycle: 'active',
                        limit: 100,
                        ...(pageParam ? { cursor: pageParam } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) => page.nextCursor ?? undefined,
    });
    const { fetchNextPage, hasNextPage, isFetchingNextPage } = dictionaries;

    useEffect(() => {
        if (!hasNextPage || isFetchingNextPage) return;
        void fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const create = useMutation({
        mutationFn: (body: CreateDictionaryRequest) => {
            const fingerprint = JSON.stringify(body);
            createAttempt.current = retainIdempotencyAttempt(
                createAttempt.current,
                fingerprint,
            );
            return requestWithSession((token) =>
                dictionaryApi.createDictionary(
                    token,
                    body,
                    createAttempt.current!.key,
                ),
            );
        },
        onSuccess: ({ dictionary }) => {
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
        const data = new FormData(event.currentTarget);
        create.mutate({
            description: String(data.get('description') ?? '').trim() || null,
            name: String(data.get('name') ?? ''),
            sourceLanguage: String(
                data.get('sourceLanguage') ?? '',
            ) as CreateDictionaryRequest['sourceLanguage'],
            targetLanguage: String(
                data.get('targetLanguage') ?? '',
            ) as CreateDictionaryRequest['targetLanguage'],
        });
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

    const list = dictionaries.data?.pages.flatMap((page) => page.data) ?? [];
    const loadError =
        languages.error ?? (dictionaries.data ? null : dictionaries.error);

    return {
        catalog: languages.data?.languages ?? [],
        changeSource,
        changeTarget,
        closeCreate: () => setCreateOpen(false),
        create,
        createOpen,
        createSourceLanguage,
        createTargetLanguage,
        dictionaries,
        list,
        loadError,
        openCreate: () => setCreateOpen(true),
        pending: dictionaries.isPending || languages.isPending,
        retryLoad,
        submitCreate,
    };
}

export type DictionaryNavigationState = ReturnType<
    typeof useDictionaryNavigation
>;
