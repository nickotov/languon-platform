'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { DictionaryChatSnippet } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useDictionarySnippets } from '../../hooks/use-dictionary-snippets';
import { snippetCopy } from '../../lib/snippet-copy';
import type { DictionarySnippetContext } from '../../types';
import { DictionarySnippetCard } from '../snippet-card/snippet-card';

type SnippetListValue = {
    snippets: DictionaryChatSnippet[];
    context: DictionarySnippetContext;
    applying: boolean;
    onApplying(value: boolean): void;
};
const SnippetList = createContext<SnippetListValue | null>(null);

export function DictionarySnippetsForTurn({
    turnId,
}: {
    turnId: string | null | undefined;
}) {
    const value = useContext(SnippetList);
    if (!value || !turnId) {
        return null;
    }

    return value.snippets
        .filter((snippet) => snippet.turnId === turnId)
        .map((snippet) => (
            <DictionarySnippetCard
                key={snippet.id}
                snippet={snippet}
                context={value.context}
                disabled={value.applying}
                onApplying={value.onApplying}
            />
        ));
}

export function DictionarySnippets({
    context,
    actorId,
    completionKey,
    reconciliationKey,
    children,
}: {
    context?: DictionarySnippetContext | undefined;
    actorId: string;
    completionKey: string;
    reconciliationKey: number;
    children: ReactNode;
}) {
    const { locale } = useI18n();
    const copy = snippetCopy(locale);
    const [applying, setApplying] = useState(false);
    const query = useDictionarySnippets(
        context,
        actorId,
        completionKey,
        reconciliationKey,
    );

    function refresh() {
        void query.refresh();
    }

    if (!context) {
        return children;
    }

    const value = {
        snippets: query.data?.snippets ?? [],
        context,
        applying,
        onApplying: setApplying,
    };

    return (
        <SnippetList.Provider value={value}>
            {children}
            {query.isPending && <LoadingState>{copy.loading}</LoadingState>}
            {query.isError && (
                <InlineAlert tone='error'>{copy.error}</InlineAlert>
            )}
            {query.isError && (
                <Button type='button' variant='secondary' onClick={refresh}>
                    {copy.retry}
                </Button>
            )}
        </SnippetList.Provider>
    );
}
