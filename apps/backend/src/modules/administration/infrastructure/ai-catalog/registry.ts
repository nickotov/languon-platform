import {
    AdminAiCatalogEntrySchema,
    type AdminAiCatalogEntry,
    type AdminAiCatalogKind,
    type AdminAiCatalogSummary,
} from '@languon/contracts';

function identity(entry: { kind: AdminAiCatalogKind; id: string }) {
    return `${entry.kind}:${entry.id}`;
}

/** A catalog contains reviewed definitions only; it never holds executable callbacks. */
export function createAiCatalog(entries: readonly AdminAiCatalogEntry[]) {
    const index = new Map<string, AdminAiCatalogEntry>();
    for (const candidate of entries) {
        const entry = AdminAiCatalogEntrySchema.parse(candidate);
        const key = identity(entry);
        if (index.has(key)) {
            throw new Error(`Duplicate AI catalog identity: ${key}`);
        }

        index.set(key, entry);
    }

    for (const entry of index.values()) {
        for (const reference of entry.references) {
            if (!index.has(identity(reference))) {
                throw new Error(
                    `Unresolved AI catalog reference: ${identity(reference)}`,
                );
            }
        }
    }

    const summaries: AdminAiCatalogSummary[] = [...index.values()].map(
        ({ id, kind, name, description, module, scope, references }) => ({
            id,
            kind,
            name,
            description,
            module,
            scope,
            references,
        }),
    );

    return {
        summaries: () => structuredClone(summaries),
        entry: (kind: AdminAiCatalogKind, id: string) => {
            const result = index.get(identity({ kind, id }));

            return result ? structuredClone(result) : undefined;
        },
    };
}
