'use client';
import { useContext } from 'react';
import { DictionarySnippetCard } from '../../snippet-card/snippet-card';
import { SnippetList } from '../../../model/snippet-list-context';

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
