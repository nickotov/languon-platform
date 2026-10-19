import { useEffect, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { KnowledgeCategory } from '@languon/contracts';
import { useAuth } from '@/fsd/features/auth';
import { useSessionStore } from '@/fsd/entities/session';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { knowledgeApi } from '@/fsd/entities/knowledge';

export function useKnowledgeLibrary() {
    const { requestWithSession } = useAuth();
    const actorId = useSessionStore((state) => state.user?.id);
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState<KnowledgeCategory | ''>('');
    const [language, setLanguage] = useState('');
    useEffect(() => {
        const timeout = window.setTimeout(() => setQuery(search.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [search]);
    const notes = useInfiniteQuery({
        queryKey: ['knowledge', actorId, 'library', query, category, language],
        initialPageParam: 0,
        queryFn: ({ signal, pageParam }) =>
            requestWithSession((token) =>
                knowledgeApi.list(
                    token,
                    {
                        offset: pageParam,
                        limit: 20,
                        ...(query ? { q: query } : {}),
                        ...(category ? { category } : {}),
                        ...(language ? { studiedLanguage: language } : {}),
                    },
                    signal,
                ),
            ),
        getNextPageParam: (page) =>
            page.notes.length && page.offset + page.notes.length < page.total
                ? page.offset + page.notes.length
                : undefined,
        enabled: Boolean(actorId),
        gcTime: 0,
        retry: false,
    });
    const languages = useQuery({
        queryKey: ['dictionary-languages'],
        queryFn: ({ signal }) => dictionaryApi.listLanguages(signal),
        staleTime: Infinity,
    });
    return {
        notes,
        languages,
        search,
        setSearch,
        category,
        setCategory,
        language,
        setLanguage,
    };
}
