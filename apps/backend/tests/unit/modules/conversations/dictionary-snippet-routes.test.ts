import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuthHttpPolicy } from '../../../../src/modules/authentication/interface/http/auth-http-policy';
import { createConversationRoutes } from '../../../../src/modules/conversations/interface/http/conversation.routes';
import { DictionaryVersionConflictError } from '../../../../src/modules/dictionaries/application/dictionary-errors';

function fixture() {
    const ownerId = randomUUID();
    const conversationId = randomUUID();
    const snippetId = randomUUID();
    const dictionaryId = randomUUID();
    const result = {
        operationId: randomUUID(),
        dictionaryId,
        cardIds: [randomUUID()],
        addedCount: 1,
        archivedCount: 0,
        duplicateCount: 0,
        dictionaryVersion: 2,
        settingsVersion: 1,
    };
    const listDictionarySnippets = vi.fn(async () => ({ snippets: [] }));
    const applyDictionarySnippet = vi.fn(async () => result);
    const app = createConversationRoutes({
        service: {
            access: async () => ({ ownerId }),
            store: { listDictionarySnippets, applyDictionarySnippet },
        } as never,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    const request = {
        operationId: result.operationId,
        mode: 'append',
        selectedIndices: [0],
        expectedDictionaryVersion: 1,
        expectedSettingsVersion: 1,
    };
    const headers = {
        Authorization: 'Bearer synthetic.test.token',
        Origin: 'http://localhost:3333',
        'Content-Type': 'application/json',
    };
    const path = `/conversations/${conversationId}/dictionary-snippets/${snippetId}/apply`;

    return {
        app,
        ownerId,
        conversationId,
        snippetId,
        result,
        listDictionarySnippets,
        applyDictionarySnippet,
        request,
        headers,
        path,
    };
}

describe('dictionary snippet HTTP contracts', () => {
    it('exposes retained list and passes only server-authorized identity plus the validated apply selection', async () => {
        const f = fixture();
        const listed = await f.app.request(
            `/conversations/${f.conversationId}/dictionary-snippets`,
            { headers: f.headers },
        );

        expect(listed.status).toBe(200);
        expect(await listed.json()).toEqual({ snippets: [] });
        expect(f.listDictionarySnippets).toHaveBeenCalledWith(
            { ownerId: f.ownerId },
            f.conversationId,
        );

        const response = await f.app.request(f.path, {
            method: 'POST',
            headers: f.headers,
            body: JSON.stringify(f.request),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(f.result);
        expect(f.applyDictionarySnippet).toHaveBeenCalledWith(
            { ownerId: f.ownerId },
            f.conversationId,
            f.snippetId,
            f.request,
        );
    });

    it.each([
        { ownerId: randomUUID() },
        { dictionaryId: randomUUID() },
        { values: [{ source: 'forged', translation: 'forged' }] },
        { selectedIndices: [] },
        { selectedIndices: [0, 0] },
        { selectedIndices: [100] },
    ])(
        'rejects untrusted target/content or invalid selection %j',
        async (invalid) => {
            const f = fixture();
            const response = await f.app.request(f.path, {
                method: 'POST',
                headers: f.headers,
                body: JSON.stringify({ ...f.request, ...invalid }),
            });

            expect(response.status).toBe(400);
            expect(f.applyDictionarySnippet).not.toHaveBeenCalled();
        },
    );

    it('maps canonical dictionary write-version failures to409 without an internal exception', async () => {
        const f = fixture();
        f.applyDictionarySnippet.mockRejectedValueOnce(
            new DictionaryVersionConflictError(),
        );

        const response = await f.app.request(f.path, {
            method: 'POST',
            headers: f.headers,
            body: JSON.stringify(f.request),
        });

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({
            error: { code: 'version_conflict' },
        });
    });
});
