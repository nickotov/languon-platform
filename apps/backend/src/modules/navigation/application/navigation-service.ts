import type {
    NavigationQuery,
    NavigationResource,
    NavigationResourceKind,
} from '@languon/contracts';
import type { RateLimiter } from '../../authentication/application/ports/rate-limiter';
import {
    NavigationError,
    type NavigationMetadataStore,
    type NavigationResourceReader,
    type NavigationEntry,
} from './navigation-ports';
export interface NavigationRequestContext {
    signal: AbortSignal;
    clientAddress: string;
}
export class NavigationService {
    constructor(
        private readonly deps: {
            readers: NavigationResourceReader[];
            metadata: NavigationMetadataStore;
            authenticate: (token: string) => Promise<{ userId: string }>;
            rateLimiter: RateLimiter;
            now?: () => Date;
        },
    ) {}
    private async owner(token: string, context: NavigationRequestContext) {
        context.signal.throwIfAborted();
        const ip = await this.deps.rateLimiter.consume({
            scope: 'navigation-http',
            subject: context.clientAddress,
            limit: 240,
            windowMs: 60000,
            signal: context.signal,
        });
        if (!ip.allowed)
            throw new NavigationError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        const { userId } = await this.deps.authenticate(token);
        const owner = await this.deps.rateLimiter.consume({
            scope: 'navigation-owner',
            subject: userId,
            limit: 240,
            windowMs: 60000,
            signal: context.signal,
        });
        if (!owner.allowed)
            throw new NavigationError(
                'rate_limited',
                'Too many requests. Please try again shortly.',
            );
        context.signal.throwIfAborted();
        return userId;
    }
    async list(
        token: string,
        context: NavigationRequestContext,
        query: NavigationQuery,
        recentOnly = false,
    ) {
        const owner = await this.owner(token, context);
        const groups = await Promise.all(
            this.deps.readers
                .filter((r) => !query.kind || r.kind === query.kind)
                .map((r) => r.read(owner, { ...query, recentOnly })),
        );
        context.signal.throwIfAborted();
        const entries = groups.flat();
        entries.sort((a, b) => {
            if (!recentOnly && !query.q && a.pinned !== b.pinned)
                return a.pinned ? -1 : 1;
            const time = (entry: NavigationEntry) => entry.lastOpenedAt;
            if (query.q)
                return (
                    a.title.localeCompare(b.title) ||
                    a.kind.localeCompare(b.kind) ||
                    a.id.localeCompare(b.id)
                );
            return (
                (time(b) ?? '').localeCompare(time(a) ?? '') ||
                (!recentOnly && !query.q
                    ? (b.activityAt ?? '').localeCompare(a.activityAt ?? '')
                    : 0) ||
                a.kind.localeCompare(b.kind) ||
                a.id.localeCompare(b.id)
            );
        });
        const selected = entries.slice(0, query.limit);
        if (
            query.currentId &&
            query.kind &&
            !query.q &&
            !recentOnly &&
            !selected.some((e) => e.id === query.currentId)
        ) {
            const reader = this.deps.readers.find(
                (r) => r.kind === query.kind,
            )!;
            const [current] = await reader.read(owner, {
                id: query.currentId,
                limit: 1,
            });
            if (current) {
                if (selected.length === query.limit) selected.pop();
                selected.unshift(current);
            }
        }
        context.signal.throwIfAborted();
        const total =
            query.kind && !recentOnly
                ? await this.deps.readers
                      .find((reader) => reader.kind === query.kind)!
                      .count(owner)
                : undefined;
        context.signal.throwIfAborted();
        return {
            resources: selected.map(publicResource),
            ...(total !== undefined ? { total } : {}),
        };
    }
    async mutate(
        token: string,
        context: NavigationRequestContext,
        kind: NavigationResourceKind,
        id: string,
        mutation: { pinned: boolean } | { opened: true },
    ) {
        const owner = await this.owner(token, context);
        const reader = this.deps.readers.find((r) => r.kind === kind)!;
        const [before] = await reader.read(owner, { id, limit: 1 });
        if (!before) throw unavailable();
        context.signal.throwIfAborted();
        await this.deps.metadata.record(
            owner,
            kind,
            id,
            'opened' in mutation
                ? { openedAt: this.deps.now?.() ?? new Date() }
                : { pinned: mutation.pinned },
        );
        const [after] = await reader.read(owner, { id, limit: 1 });
        if (!after) throw unavailable();
        return { resource: publicResource(after) };
    }
}
function publicResource({
    pinnedAt: _pinnedAt,
    activityAt: _activityAt,
    ...resource
}: NavigationEntry): NavigationResource {
    return resource;
}
function unavailable() {
    return new NavigationError(
        'resource_not_found',
        'The resource is unavailable.',
    );
}
