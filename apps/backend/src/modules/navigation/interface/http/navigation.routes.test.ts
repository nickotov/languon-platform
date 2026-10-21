import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { NavigationResourceKind } from '@languon/contracts';
import { NavigationService } from '../../application/navigation-service';
import type {
    NavigationEntry,
    NavigationReadQuery,
} from '../../application/navigation-ports';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { InvalidAccessTokenError } from '../../../authentication/application/ports/access-token';
import { createNavigationRoutes } from './navigation.routes';
const token = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature';
const headers = { Authorization: token };
function entry(
    kind: NavigationResourceKind,
    title: string,
    opened: string | null = null,
    pin: string | null = null,
): NavigationEntry {
    return {
        id: randomUUID(),
        kind,
        title,
        href: `/${kind}/${title}`,
        lastOpenedAt: opened,
        pinned: !!pin,
        pinnedAt: pin,
    };
}
function fixture() {
    const owner = randomUUID();
    const resources: NavigationEntry[] = [];
    const read = vi.fn(async (_owner: string, query: NavigationReadQuery) =>
        resources.filter(
            (e) =>
                (!query.id || e.id === query.id) &&
                (!query.recentOnly || !!e.lastOpenedAt) &&
                (!query.q ||
                    e.title.toLowerCase().includes(query.q.toLowerCase())),
        ),
    );
    const record = vi.fn(async () => {});
    const authenticate = vi.fn(async () => ({ userId: owner }));
    const consume = vi.fn(async () => ({
        allowed: true,
        limit: 240,
        remaining: 239,
        retryAfterSeconds: 0,
    }));
    const service = new NavigationService({
        readers: [
            { kind: 'dictionary', read, count: async () => resources.length },
        ],
        metadata: { record },
        authenticate,
        rateLimiter: { consume, linkSubject: vi.fn() },
        now: () => new Date('2026-10-20T10:00:00Z'),
    });
    const policy = new AuthHttpPolicy({
        allowedOrigins: ['http://localhost:3000'],
        appEnvironment: 'test',
        refreshTokenTtlSeconds: 3600,
    });
    const app = createNavigationRoutes({ service, policy });
    return {
        app,
        owner,
        resources,
        read,
        record,
        authenticate,
        consume,
        service,
    };
}
describe('Navigation HTTP and orchestration', () => {
    it('requires bearer authentication and maps expired tokens without exposing internal errors', async () => {
        const f = fixture();
        expect((await f.app.request('/navigation/resources')).status).toBe(401);
        expect(f.read).not.toHaveBeenCalled();
        f.authenticate.mockRejectedValue(new InvalidAccessTokenError());
        expect(
            (await f.app.request('/navigation/resources', { headers })).status,
        ).toBe(401);
        expect(f.read).not.toHaveBeenCalled();
    });
    it('validates bounded queries, UUIDs and strict pin payloads', async () => {
        const f = fixture();
        for (const query of [
            'limit=0',
            'limit=51',
            'q=',
            'kind=folder',
            'currentId=bad',
        ])
            expect(
                (
                    await f.app.request(`/navigation/resources?${query}`, {
                        headers,
                    })
                ).status,
            ).toBe(400);
        const invalid = await f.app.request(
            `/navigation/resources/dictionary/${randomUUID()}/pin`,
            {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ pinned: 'yes', ownerId: randomUUID() }),
            },
        );
        expect(invalid.status).toBe(400);
        const malformed = await f.app.request(
            `/navigation/resources/dictionary/${randomUUID()}/pin`,
            {
                method: 'PUT',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: '{bad',
            },
        );
        expect(malformed.status).toBe(400);
        expect(f.record).not.toHaveBeenCalled();
    });
    it('sorts pinned before opened, retains the current resource, and does not write recency on reads', async () => {
        const f = fixture();
        const older = entry('dictionary', 'Older', '2026-10-19T00:00:00Z');
        const recent = entry('dictionary', 'Recent', '2026-10-20T00:00:00Z');
        const pinned = entry(
            'dictionary',
            'Pinned',
            null,
            '2026-10-18T00:00:00Z',
        );
        f.resources.push(older, recent, pinned);
        const shortcuts = await f.app.request(
            '/navigation/resources?kind=dictionary&limit=2',
            { headers },
        );
        expect(
            (await shortcuts.json()).resources.map(
                (r: NavigationEntry) => r.id,
            ),
        ).toEqual([pinned.id, recent.id]);
        const result = await f.app.request(
            `/navigation/resources?kind=dictionary&limit=2&currentId=${older.id}`,
            { headers },
        );
        expect(result.headers.get('Cache-Control')).toBe('private, no-store');
        const body = await result.json();
        expect(body.resources.map((r: NavigationEntry) => r.id)).toEqual([
            older.id,
            pinned.id,
        ]);
        expect(body.resources[0]).not.toHaveProperty('pinnedAt');
        expect(body.total).toBe(3);
        const search = await f.app.request(
            '/navigation/resources?kind=dictionary&q=recent&limit=1',
            { headers },
        );
        expect((await search.json()).total).toBe(3);
        expect(f.read).toHaveBeenCalledWith(f.owner, expect.any(Object));
        expect(f.record).not.toHaveBeenCalled();
    });
    it('returns last-opened resources only for an empty palette, regardless of pins', async () => {
        const f = fixture();
        f.resources.push(
            entry('dictionary', 'Pinned', null, '2026-10-20T00:00:00Z'),
            entry('dictionary', 'Older', '2026-10-18T00:00:00Z'),
            entry('dictionary', 'Latest', '2026-10-19T00:00:00Z'),
        );
        const response = await f.app.request('/navigation/recent?limit=1', {
            headers,
        });
        expect(
            (await response.json()).resources.map(
                (r: NavigationEntry) => r.title,
            ),
        ).toEqual(['Latest']);
    });
    it('writes metadata only after a live owner read, and rejects stale references', async () => {
        const f = fixture();
        const resource = entry('dictionary', 'Live');
        f.resources.push(resource);
        expect(
            (
                await f.app.request(
                    `/navigation/resources/dictionary/${randomUUID()}/opened`,
                    { headers, method: 'POST' },
                )
            ).status,
        ).toBe(404);
        expect(f.record).not.toHaveBeenCalled();
        expect(
            (
                await f.app.request(
                    `/navigation/resources/dictionary/${resource.id}/opened`,
                    { headers, method: 'POST' },
                )
            ).status,
        ).toBe(200);
        expect(f.record).toHaveBeenCalledWith(
            f.owner,
            'dictionary',
            resource.id,
            { openedAt: new Date('2026-10-20T10:00:00Z') },
        );
    });
    it('honors allowed origins and rejects foreign origins before reading', async () => {
        const f = fixture();
        expect(
            (
                await f.app.request('/navigation/resources', {
                    headers: {
                        ...headers,
                        Origin: 'https://untrusted.example',
                    },
                })
            ).status,
        ).toBe(403);
        expect(f.read).not.toHaveBeenCalled();
        const response = await f.app.request('/navigation/resources', {
            headers: { ...headers, Origin: 'http://localhost:3000' },
        });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
            'http://localhost:3000',
        );
    });
    it('applies rate limits and cancellation before reading or mutating', async () => {
        const f = fixture();
        f.consume.mockResolvedValue({
            allowed: false,
            limit: 240,
            remaining: 0,
            retryAfterSeconds: 60,
        });
        expect(
            (await f.app.request('/navigation/resources', { headers })).status,
        ).toBe(429);
        expect(f.read).not.toHaveBeenCalled();
        const abort = new AbortController();
        abort.abort();
        await expect(
            f.service.list(
                'token',
                { signal: abort.signal, clientAddress: '127.0.0.1' },
                { limit: 5 },
            ),
        ).rejects.toThrow();
        expect(f.read).not.toHaveBeenCalled();
    });
});
