import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { KnowledgeBlockCopyService } from '../../application/block-copy-service';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createKnowledgeBlockCopyRoutes } from './block-copy.routes';

it('requires authenticated, strict reference-only copy requests and returns a dependency preview', async () => {
    const copy = vi.fn(async () => ({
        branch: null,
        selectedCount: 1,
        blockCount: 2,
        dependencyCount: 1,
        mediaCount: 1,
        replayed: false,
    }));
    const service = new KnowledgeBlockCopyService({
        store: { copy },
        authenticate: async () => ({ userId: randomUUID() }),
        rateLimiter: {
            consume: async () => ({
                allowed: true,
                limit: 60,
                remaining: 59,
                retryAfterSeconds: 0,
            }),
            linkSubject: async () => {},
        },
    });
    const app = createKnowledgeBlockCopyRoutes({
        service,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const url = `/knowledge/notes/${randomUUID()}/blocks/copy`;
    const input = {
        operationId: randomUUID(),
        branchId: randomUUID(),
        expectedBranchVersion: 1,
        preview: true,
        source: {
            kind: 'owned-working',
            noteId: randomUUID(),
            branchId: randomUUID(),
            expectedVersion: 1,
        },
        blockIds: [randomUUID()],
    };
    const json = { 'Content-Type': 'application/json' },
        headers = { ...json, Authorization: 'Bearer a.b.c' };
    expect(
        (
            await app.request(url, {
                method: 'POST',
                headers: json,
                body: JSON.stringify(input),
            })
        ).status,
    ).toBe(401);
    expect(
        (
            await app.request(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ...input, assetId: randomUUID() }),
            })
        ).status,
    ).toBe(400);
    expect(copy).not.toHaveBeenCalled();
    const preview = await app.request(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
    });
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({
        branch: null,
        dependencyCount: 1,
        mediaCount: 1,
    });
    expect(copy).toHaveBeenCalledTimes(1);
    expect(
        (
            await app.request(url, {
                method: 'POST',
                headers: { ...headers, Origin: 'https://evil.example' },
                body: JSON.stringify(input),
            })
        ).status,
    ).toBe(403);
    expect(copy).toHaveBeenCalledTimes(1);
});
