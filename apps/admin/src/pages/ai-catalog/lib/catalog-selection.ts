import type {
    AdminAiCatalogKind,
    AdminAiCatalogReference,
    AdminAiCatalogSummary,
} from '@languon/contracts';

export type CatalogKindFilter = AdminAiCatalogKind | 'all';
export type CatalogScopeFilter = AdminAiCatalogSummary['scope'] | 'all';

export function catalogReferenceKey(reference: AdminAiCatalogReference) {
    return `${reference.kind}:${reference.id}`;
}

export function readCatalogSelection(
    params: URLSearchParams,
): AdminAiCatalogReference | null {
    const kind = params.get('kind');
    const id = params.get('id');
    if (!id || !['agent', 'tool', 'prompt'].includes(kind ?? '')) {
        return null;
    }

    return { kind: kind as AdminAiCatalogKind, id };
}

export function filterCatalogEntries(
    entries: readonly AdminAiCatalogSummary[],
    search: string,
    kind: CatalogKindFilter,
    scope: CatalogScopeFilter,
) {
    const query = search.trim().toLocaleLowerCase();

    return entries.filter((entry) => {
        if (kind !== 'all' && entry.kind !== kind) {
            return false;
        }

        if (scope !== 'all' && entry.scope !== scope) {
            return false;
        }

        const text = [entry.name, entry.id, entry.description, entry.module]
            .join(' ')
            .toLocaleLowerCase();

        return !query || text.includes(query);
    });
}
