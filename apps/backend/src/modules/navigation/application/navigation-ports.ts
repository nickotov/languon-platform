import type {
    NavigationQuery,
    NavigationResource,
    NavigationResourceKind,
} from '@languon/contracts';
export interface NavigationEntry extends NavigationResource {
    pinnedAt: string | null;
    activityAt?: string;
}
export interface NavigationReadQuery extends NavigationQuery {
    recentOnly?: boolean;
    id?: string;
}
/** Implemented by each owning domain; source titles and live access are authoritative. */
export interface NavigationResourceReader {
    readonly kind: NavigationResourceKind;
    count(ownerId: string): Promise<number>;
    read(
        ownerId: string,
        query: NavigationReadQuery,
    ): Promise<NavigationEntry[]>;
}
export interface NavigationMetadataStore {
    record(
        ownerId: string,
        kind: NavigationResourceKind,
        id: string,
        mutation: { openedAt?: Date; pinned?: boolean },
    ): Promise<void>;
}
export class NavigationError extends Error {
    constructor(
        public readonly code: 'resource_not_found' | 'rate_limited',
        message: string,
    ) {
        super(message);
    }
}
