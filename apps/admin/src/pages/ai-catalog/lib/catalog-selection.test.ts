import { expect, it } from 'vitest';
import type { AdminAiCatalogSummary } from '@languon/contracts';
import {
    filterCatalogEntries,
    readCatalogSelection,
} from './catalog-selection';

const futureTool: AdminAiCatalogSummary = {
    id: 'new_future_tool',
    kind: 'tool',
    name: 'Future practice generator',
    description: 'Create contextual recall tasks.',
    module: 'learning',
    scope: 'application',
    references: [],
};
const developmentPrompt: AdminAiCatalogSummary = {
    ...futureTool,
    id: 'studio-instructions',
    kind: 'prompt',
    name: 'Studio instructions',
    description: 'Synthetic development data.',
    scope: 'development',
};

it('includes new registry entries without hardcoded IDs and composes text/kind/scope filters', () => {
    const entries = [futureTool, developmentPrompt];
    expect(
        filterCatalogEntries(entries, '  RECALL ', 'tool', 'application'),
    ).toEqual([futureTool]);

    expect(
        filterCatalogEntries(entries, 'studio', 'all', 'development'),
    ).toEqual([developmentPrompt]);

    expect(filterCatalogEntries(entries, '', 'all', 'all')).toEqual(entries);
    expect(filterCatalogEntries(entries, 'studio', 'tool', 'all')).toEqual([]);
});

it('keeps complete deep links and ignores missing or invalid reference types', () => {
    expect(
        readCatalogSelection(
            new URLSearchParams('kind=tool&id=new_future_tool'),
        ),
    ).toEqual({ kind: 'tool', id: 'new_future_tool' });

    expect(
        readCatalogSelection(new URLSearchParams('kind=unknown&id=sample')),
    ).toBeNull();

    expect(readCatalogSelection(new URLSearchParams('kind=tool'))).toBeNull();
});
