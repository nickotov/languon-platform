import type {
    AdminAiCatalogEntry,
    AdminAiCatalogKind,
    AdminAiCatalogSummary,
} from '@languon/contracts';

/** Checked-in definition metadata; reads never construct an executable agent or tool. */
export interface AdminAiCatalogQueries {
    list(): AdminAiCatalogSummary[];
    detail(
        kind: AdminAiCatalogKind,
        id: string,
    ): AdminAiCatalogEntry | undefined;
}
