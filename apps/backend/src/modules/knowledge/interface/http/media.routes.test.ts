import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { KnowledgeMediaService } from '../../application/media-service';
import { verifyKnowledgeAudio } from '../../infrastructure/media-audio-validation';
import { createFixtureAudio } from '../../../speech/domain/audio-integrity';
import { AuthHttpPolicy } from '../../../authentication/interface/http/auth-http-policy';
import { createKnowledgeMediaRoutes } from './media.routes';

function fixture() {
    const assetId = randomUUID(),
        noteId = randomUUID(),
        ownerId = randomUUID();
    const audio = verifyKnowledgeAudio(createFixtureAudio().bytes, 'audio/wav');
    const store = {
        upload: vi.fn(async () => ({
            id: assetId,
            mimeType: audio.mimeType,
            byteLength: audio.bytes.length,
            durationMs: audio.durationMs,
        })),
        read: vi.fn(async () => audio),
    };
    const readSpeech = vi.fn(async () => ({
        audio,
        text: 'Bonjour.',
        language: 'fr',
    }));
    const service = new KnowledgeMediaService({
        store,
        authenticate: async () => ({ userId: ownerId }),
        rateLimiter: {
            consume: async () => ({
                allowed: true,
                retryAfterSeconds: 0,
                limit: 180,
                remaining: 179,
            }),
            linkSubject: async () => {},
        },
        verify: verifyKnowledgeAudio,
        readSpeech,
    });
    const app = createKnowledgeMediaRoutes({
        service,
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
    });
    return { app, store, noteId, assetId, audio, readSpeech };
}
it('requires bearer upload, validates bytes before persistence and rejects oversize input', async () => {
    const { app, store, noteId, audio } = fixture();
    const url = `/knowledge/notes/${noteId}/media`;
    expect(
        (
            await app.request(url, {
                method: 'POST',
                headers: { 'Content-Type': 'audio/wav' },
                body: new Uint8Array(audio.bytes),
            })
        ).status,
    ).toBe(401);
    const headers = {
        'Content-Type': 'audio/wav',
        Authorization: 'Bearer a.b.c',
    };
    expect(
        (
            await app.request(url, {
                method: 'POST',
                headers,
                body: '<svg onload=alert(1)>',
            })
        ).status,
    ).toBe(400);
    expect(store.upload).not.toHaveBeenCalled();
    expect(
        (
            await app.request(url, {
                method: 'POST',
                headers,
                body: new Uint8Array(5 * 1024 * 1024 + 1),
            })
        ).status,
    ).toBe(413);
    const result = await app.request(url, {
        method: 'POST',
        headers,
        body: new Uint8Array(audio.bytes),
    });
    expect(result.status).toBe(201);
    expect(store.upload).toHaveBeenCalledTimes(1);
});
it('imports an authorized preview only on explicit Apply and returns its exact source text', async () => {
    const { app, store, noteId, assetId, readSpeech } = fixture();
    const result = await app.request(
        `/knowledge/notes/${noteId}/media/from-speech`,
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer a.b.c',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ playbackId: assetId }),
        },
    );
    expect(result.status).toBe(201);
    expect(await result.json()).toMatchObject({
        sourceText: 'Bonjour.',
        language: 'fr',
        asset: { id: assetId },
    });
    expect(readSpeech).toHaveBeenCalledTimes(1);
    expect(store.upload).toHaveBeenCalledTimes(1);
});
it('returns authorized fixed-MIME audio with no-store and nosniff and passes share proof explicitly', async () => {
    const { app, store, noteId, assetId } = fixture();
    const response = await app.request(
        `/knowledge/notes/${noteId}/media/${assetId}?kind=note&locator=example`,
        { headers: { 'X-Languon-Share-Key': 'test-key' } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(store.read).toHaveBeenCalledWith(noteId, assetId, {
        access: { kind: 'note', locator: 'example', key: 'test-key' },
    });
    expect(
        (
            await app.request(`/knowledge/notes/${noteId}/media/${assetId}`, {
                headers: { Origin: 'https://evil.example' },
            })
        ).status,
    ).toBe(403);
});
