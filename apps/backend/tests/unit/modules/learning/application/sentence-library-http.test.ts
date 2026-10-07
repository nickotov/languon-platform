import { describe, expect, it, vi } from 'vitest';
import { fixture } from '../learning-test-fixture';
import { SentencePracticeService } from '../../../../../src/modules/learning/application/sentence-practice-service';
import type { SentencePracticeStore } from '../../../../../src/modules/learning/application/ports/sentence-practice-store';
import type { SentenceLibraryStore } from '../../../../../src/modules/learning/application/ports/sentence-library-store';
import { createSentenceRoutes } from '../../../../../src/modules/learning/interface/http/sentence.routes';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
import {
    SentenceConflictError,
    SentenceUnavailableError,
} from '../../../../../src/modules/learning/domain/sentence-errors';
const id = '00000000-0000-4000-8000-000000000001';
const prefix = `/learning/dictionaries/${id}/sentences/library`;
function setup() {
    const base = fixture();
    const store = {
        prepare: vi.fn(),
        next: vi.fn(),
        getJob: vi.fn(),
        cancelJob: vi.fn(),
        enqueueCheck: vi.fn(),
        attempts: vi.fn(),
        progress: vi.fn(),
        revealReference: vi.fn(),
        manualReviews: vi.fn(),
    } satisfies SentencePracticeStore;
    const library = {
        adminDictionaries: vi.fn<SentenceLibraryStore['adminDictionaries']>(),
        list: vi.fn<SentenceLibraryStore['list']>(),
        detail: vi.fn<SentenceLibraryStore['detail']>(),
        snapshot: vi.fn<SentenceLibraryStore['snapshot']>(),
        mutate: vi.fn<SentenceLibraryStore['mutate']>(),
        adminList: vi.fn<SentenceLibraryStore['adminList']>(),
        adminDetail: vi.fn<SentenceLibraryStore['adminDetail']>(),
        adminSnapshot: vi.fn<SentenceLibraryStore['adminSnapshot']>(),
        adminMutate: vi.fn<SentenceLibraryStore['adminMutate']>(),
    } satisfies SentenceLibraryStore;
    const service = new SentencePracticeService({
        ...base.dependencies,
        enabled: true,
        store,
        library,
    });
    const app = createSentenceRoutes({
        service,
        policy: new AuthHttpPolicy({
            allowedOrigins: [],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const request = (path: string, input?: unknown) =>
        app.request(path, {
            method: input === undefined ? 'GET' : 'POST',
            headers: {
                Authorization: 'Bearer valid.token.value',
                'Content-Type': 'application/json',
            },
            ...(input === undefined ? {} : { body: JSON.stringify(input) }),
        });
    return { ...base, store, library, service, app, request };
}
describe('sentence library HTTP boundaries', () => {
    it("requires a verified live share key for another learner's library", async () => {
        const f = setup();
        f.library.list.mockResolvedValue({ items: [], nextCursor: null });
        const shareId = 'S'.repeat(24);
        const response = await f.app.request(
            `/learning/shared-dictionaries/${shareId}/sentences/library`,
            {
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'X-Languon-Share-Key': 'K'.repeat(43),
                },
            },
        );
        expect(response.status).toBe(200);
        expect(f.library.list).toHaveBeenCalledWith(
            {
                kind: 'shared',
                shareId,
                keyDigest: 'digest',
                learnerId: 'learner',
            },
            expect.anything(),
            expect.anything(),
        );
        expect(f.dependencies.cryptography.verifyShare).toHaveBeenCalledOnce();
        expect(f.store.next).not.toHaveBeenCalled();
    });
    it('rejects revoked share access before reading references', async () => {
        const f = setup();
        f.dependencies.cryptography.verifyShare.mockReturnValue(false);
        const response = await f.app.request(
            `/learning/shared-dictionaries/${'S'.repeat(24)}/sentences/library/${id}`,
            {
                headers: {
                    Authorization: 'Bearer valid.token.value',
                    'X-Languon-Share-Key': 'K'.repeat(43),
                },
            },
        );
        expect(response.status).toBe(404);
        expect(f.library.detail).not.toHaveBeenCalled();
    });
    it('lists saved examples without admitting generation or altering practice', async () => {
        const f = setup();
        f.library.list.mockResolvedValue({ items: [], nextCursor: null });
        const response = await f.request(
            `${prefix}?personalArchive=archived&limit=10`,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], nextCursor: null });
        expect(f.library.list).toHaveBeenCalledWith(
            { kind: 'owner', dictionaryId: id, learnerId: 'learner' },
            expect.objectContaining({ personalArchive: 'archived', limit: 10 }),
            expect.objectContaining({ now: f.dependencies.clock.now() }),
        );
        for (const method of Object.values(f.store))
            expect(method).not.toHaveBeenCalled();
    });
    it('preview routes to a read-only detail operation rather than reference reveal', async () => {
        const f = setup();
        f.library.detail.mockRejectedValue(new SentenceUnavailableError());
        const response = await f.request(`${prefix}/${id}`);
        expect(response.status).toBe(404);
        expect(f.library.detail).toHaveBeenCalledWith(
            expect.objectContaining({ learnerId: 'learner' }),
            id,
            expect.anything(),
        );
        expect(f.store.revealReference).not.toHaveBeenCalled();
        expect(f.store.next).not.toHaveBeenCalled();
    });
    it('rejects anonymous management requests without reaching persistence', async () => {
        const f = setup();
        expect((await f.app.request(prefix)).status).toBe(401);
        expect(f.library.list).not.toHaveBeenCalled();
        expect(f.library.mutate).not.toHaveBeenCalled();
    });
    it('validates archive operations and excludes admin capabilities at user boundary', async () => {
        const f = setup();
        for (const operation of [
            'delete',
            'global-archive',
            'global-restore',
        ]) {
            const response = await f.request(`${prefix}/mutations`, {
                operationId: id,
                operation,
                selection: {
                    type: 'selected',
                    items: [{ exerciseId: id, expectedVersion: 0 }],
                },
            });
            expect(response.status).toBe(400);
        }
        expect(f.library.mutate).not.toHaveBeenCalled();
    });
    it('rejects duplicate selected IDs before any mutation', async () => {
        const f = setup();
        const response = await f.request(`${prefix}/mutations`, {
            operationId: id,
            operation: 'archive',
            selection: {
                type: 'selected',
                items: [
                    { exerciseId: id, expectedVersion: 0 },
                    { exerciseId: id, expectedVersion: 0 },
                ],
            },
        });
        expect(response.status).toBe(400);
        expect(f.library.mutate).not.toHaveBeenCalled();
    });
    it('preserves stale confirmations as conflicts without automatic generation', async () => {
        const f = setup();
        f.library.mutate.mockRejectedValue(
            new SentenceConflictError('stale_content'),
        );
        const response = await f.request(`${prefix}/mutations`, {
            operationId: id,
            operation: 'archive',
            selection: { type: 'all-matching', snapshotToken: id },
        });
        expect(response.status).toBe(409);
        expect((await response.json()).error.code).toBe('stale_content');
        expect(f.library.mutate).toHaveBeenCalledOnce();
        expect(f.store.next).not.toHaveBeenCalled();
    });
    it('creates a scoped confirmation without performing its archive', async () => {
        const f = setup();
        f.library.snapshot.mockResolvedValue({
            snapshotToken: id,
            matchingCount: 42,
            expiresAt: '2026-10-02T12:15:00.000Z',
        });
        const response = await f.request(`${prefix}/snapshots`, {
            operation: 'archive',
            query: {},
        });
        expect(response.status).toBe(200);
        expect((await response.json()).matchingCount).toBe(42);
        expect(f.library.snapshot).toHaveBeenCalledOnce();
        expect(f.library.mutate).not.toHaveBeenCalled();
    });
});
