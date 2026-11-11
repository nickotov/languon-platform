'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { DictionaryChatSnippet } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useDictionarySnippets } from '../../hooks/use-dictionary-snippets';
import { useSnippetDisclosure } from '../../hooks/use-snippet-disclosure';
import { snippetCopy } from '../../lib/snippet-copy';
import type { DictionarySnippetContext } from '../../types';
import { DictionarySnippetCard } from '../snippet-card/snippet-card';

type SnippetListValue = {
    snippets: DictionaryChatSnippet[];
    context: DictionarySnippetContext;
    applying: boolean;
    expandedIds: ReadonlySet<string>;
    onToggleExpanded(id: string): void;
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
                expanded={value.expandedIds.has(snippet.id)}
                onToggleExpanded={value.onToggleExpanded}
                onApplying={value.onApplying}
            />
        ));
}

export function DictionarySnippets({
    context,
    actorId,
    completionKey,
    reconciliationKey,
    visible = true,
    children,
}: {
    context?: DictionarySnippetContext | undefined;
    actorId: string;
    completionKey: string;
    reconciliationKey: number;
    visible?: boolean;
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
    const snippets = query.data?.snippets ?? [];
    const scope = `${actorId}:${context?.conversationId ?? ''}`;
    const disclosure = useSnippetDisclosure(
        scope,
        snippets,
        query.isSuccess,
        completionKey,
        visible,
    );

    function refresh() {
        void query.refresh();
    }

    if (!context) {
        return children;
    }

    const value = {
        snippets,
        context,
        applying,
        expandedIds: disclosure.expandedIds,
        onToggleExpanded: disclosure.toggle,
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
