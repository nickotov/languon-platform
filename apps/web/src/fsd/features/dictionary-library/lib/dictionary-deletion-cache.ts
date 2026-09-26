import type { Query, QueryClient } from '@tanstack/react-query';

const dictionaryCacheFamilies = new Set([
    'dictionary',
    'dictionary-cards',
    'dictionary-generation-job',
    'dictionary-generation-card',
    'dictionary-card-authoring-job',
    'dictionary-batch-generation-job',
    'dictionary-document-generation-job',
]);

function dictionaryIdFromData(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (typeof record.dictionaryId === 'string') return record.dictionaryId;
    if (record.job && typeof record.job === 'object') {
        const job = record.job as Record<string, unknown>;
        if (typeof job.dictionaryId === 'string') return job.dictionaryId;
    }
    return null;
}

function isDictionaryCache(query: Query): boolean {
    return dictionaryCacheFamilies.has(String(query.queryKey[0] ?? ''));
}

export function removeDeletedDictionaryCaches(
    queryClient: QueryClient,
    dictionaryIds: ReadonlySet<string> | 'all',
) {
    queryClient.removeQueries({
        predicate(query) {
            if (!isDictionaryCache(query)) return false;
            if (dictionaryIds === 'all') return true;

            const family = String(query.queryKey[0] ?? '');
            if (
                family === 'dictionary' ||
                family === 'dictionary-cards' ||
                family === 'dictionary-generation-job' ||
                family === 'dictionary-generation-card'
            ) {
                return dictionaryIds.has(String(query.queryKey[1] ?? ''));
            }

            const dictionaryId = dictionaryIdFromData(query.state.data);
            return dictionaryId ? dictionaryIds.has(dictionaryId) : false;
        },
    });
}
