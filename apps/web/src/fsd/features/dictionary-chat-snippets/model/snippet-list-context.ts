'use client';
import { createContext } from 'react';
import type { DictionaryChatSnippet } from '@languon/contracts';
import type { DictionarySnippetContext } from '../types';

type SnippetListValue = {
    snippets: DictionaryChatSnippet[];
    context: DictionarySnippetContext;
    applying: boolean;
    expandedIds: ReadonlySet<string>;
    onToggleExpanded(id: string): void;
    onApplying(value: boolean): void;
};

export const SnippetList = createContext<SnippetListValue | null>(null);
