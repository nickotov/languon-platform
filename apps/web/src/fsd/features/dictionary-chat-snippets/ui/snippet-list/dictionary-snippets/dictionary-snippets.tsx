'use client';
import { useState, type ReactNode } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useDictionarySnippets } from '../../../hooks/use-dictionary-snippets';
import { useSnippetDisclosure } from '../../../hooks/use-snippet-disclosure';
import { snippetCopy } from '../../../lib/snippet-copy';
import type { DictionarySnippetContext } from '../../../types';
import { SnippetList } from '../../../model/snippet-list-context';

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
