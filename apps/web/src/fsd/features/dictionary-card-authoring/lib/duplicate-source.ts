export function normalizeDictionarySource(value: string): string {
    return value.normalize('NFKC').trim().toLowerCase();
}

export function hasLoadedSourceDuplicate(
    source: string,
    loadedSources: readonly string[],
): boolean {
    const normalized = normalizeDictionarySource(source);
    return (
        normalized.length > 0 &&
        loadedSources.some(
            (candidate) => normalizeDictionarySource(candidate) === normalized,
        )
    );
}
