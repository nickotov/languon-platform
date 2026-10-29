import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeTranscriptionDispatchPermit } from '@languon/contracts';
import { createFixtureAudio } from '../../speech/domain/audio-integrity';
import type { TranscriptionAdmissionAuthority } from '../application/transcription-provider';
import { transcriptionCredentialFingerprint } from './transcription-credential-fingerprint';
import { OpenAiKnowledgeTranscriptionProvider } from './transcription-openai';

vi.mock('../domain/transcription-processing-policy', () => ({
    isApprovedTranscriptionProcessingRevision: (revision: string) =>
        revision === 'synthetic-reviewed-processing:v1',
}));

function fixture() {
    const fixtureAudio = createFixtureAudio();
    const input = {
        operationId: randomUUID(),
        noteId: randomUUID(),
        assetId: randomUUID(),
        languages: ['en', 'fr'],
        audio: {
            bytes: fixtureAudio.bytes,
            mimeType: 'audio/wav' as const,
            durationMs: 1000,
        },
        signal: new AbortController().signal,
    };
    const permit: KnowledgeTranscriptionDispatchPermit = {
        receiptId: randomUUID(),
        operationId: input.operationId,
        noteId: input.noteId,
        assetId: input.assetId,
        checksum: createHash('sha256').update(input.audio.bytes).digest('hex'),
        providerId: 'openai',
        modelId: 'gpt-transcribe',
        providerPriceRevisionId: randomUUID(),
        customerTariffRevisionId: randomUUID(),
        processingControlsRevision: 'synthetic-reviewed-processing:v1',
        processingCredentialFingerprint:
            transcriptionCredentialFingerprint('synthetic-key')!,
        usageMeter: 'audioInputMilliseconds',
        maximumBytes: input.audio.bytes.length,
        maximumDurationMs: 1000,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const authorizeDispatch = vi.fn<
        TranscriptionAdmissionAuthority['authorizeDispatch']
    >(async () => permit);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({
            text: 'Bonjour.',
            languages: [{ code: 'fr' }],
            usage: { type: 'duration', seconds: 1.125 },
        }),
    );
    const provider = new OpenAiKnowledgeTranscriptionProvider({
        apiKey: 'synthetic-key',
        authority: { authorizeDispatch },
        fetch,
    });
    return { input, permit, authorizeDispatch, fetch, provider };
}
describe('OpenAI transcription adapter prerequisite', () => {
    it('uses fixed official multipart protocol after canonical receipt approval', async () => {
        const { input, permit, provider, fetch, authorizeDispatch } = fixture();
        const result = await provider.transcribe(input);
        expect(authorizeDispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                operationId: input.operationId,
                assetId: input.assetId,
                durationMs: 1000,
                checksum: permit.checksum,
            }),
        );
        const [url, options] = fetch.mock.calls[0]!;
        expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
        expect(options?.redirect).toBe('error');
        const form = options?.body as FormData;
        expect(form.get('model')).toBe('gpt-transcribe');
        expect(form.getAll('languages[]')).toEqual(['en', 'fr']);
        expect(form.has('language')).toBe(false);
        expect(form.has('timestamp_granularities[]')).toBe(false);
        expect(form.has('response_format')).toBe(false);
        expect((form.get('file') as Blob).type).toBe('audio/wav');
        expect(result).toEqual({
            receiptId: permit.receiptId,
            text: 'Bonjour.',
            languages: ['fr'],
            usage: { type: 'duration', seconds: 1.125 },
        });
        expect(result).not.toHaveProperty('segments');
    });
    it('rejects an unapproved processing pin despite valid accounting authority', async () => {
        const { provider, input, permit, fetch } = fixture();
        permit.processingControlsRevision = 'unreviewed';
        await expect(provider.transcribe(input)).rejects.toThrow('receipt');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('rejects credential rotation immediately before provider HTTP', async () => {
        const { input, fetch, authorizeDispatch } = fixture();
        const provider = new OpenAiKnowledgeTranscriptionProvider({
            apiKey: 'rotated-key',
            authority: { authorizeDispatch },
            fetch,
        });
        await expect(provider.transcribe(input)).rejects.toThrow('receipt');
        expect(fetch).not.toHaveBeenCalled();
    });
    it('keeps missing provider usage unknown rather than fabricating local billed duration', async () => {
        const { provider, input, fetch } = fixture();
        fetch.mockResolvedValueOnce(
            Response.json({ text: 'Speech', languages: [] }),
        );
        expect(await provider.transcribe(input)).toMatchObject({
            languages: [],
            usage: null,
        });
    });
    it('does not dispatch without approved accounting/source authority', async () => {
        const { provider, input, fetch, authorizeDispatch } = fixture();
        authorizeDispatch.mockRejectedValueOnce(
            new Error('Native duration accounting is not ready.'),
        );
        await expect(provider.transcribe(input)).rejects.toThrow('not ready');
        expect(fetch).not.toHaveBeenCalled();
    });
    it.each(['checksum', 'expiry', 'bound'])(
        'rejects mismatched %s receipt before HTTP',
        async (variant) => {
            const { provider, input, permit, fetch, authorizeDispatch } =
                fixture();
            if (variant === 'checksum') permit.checksum = '0'.repeat(64);
            if (variant === 'expiry')
                permit.expiresAt = new Date(Date.now() - 1000).toISOString();
            if (variant === 'bound') permit.maximumDurationMs = 999;
            authorizeDispatch.mockResolvedValueOnce(permit);
            await expect(provider.transcribe(input)).rejects.toThrow('receipt');
            expect(fetch).not.toHaveBeenCalled();
        },
    );
    it('rejects caller-forged audio metadata before authority or HTTP', async () => {
        const { provider, input, fetch, authorizeDispatch } = fixture();
        input.audio.durationMs = 42;
        await expect(provider.transcribe(input)).rejects.toThrow(
            'immutable audio',
        );
        expect(fetch).not.toHaveBeenCalled();
        expect(authorizeDispatch).not.toHaveBeenCalled();
    });
    it('cancels before dispatch and never retries ambiguous provider errors', async () => {
        const { provider, input, fetch } = fixture();
        const aborted = new AbortController();
        aborted.abort();
        await expect(
            provider.transcribe({ ...input, signal: aborted.signal }),
        ).rejects.toThrow();
        expect(fetch).not.toHaveBeenCalled();
        fetch.mockResolvedValueOnce(
            new Response('private upstream details', { status: 503 }),
        );
        await expect(provider.transcribe(input)).rejects.toThrow(
            'temporarily unavailable',
        );
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('rejects malformed, oversized and unusable provider output', async () => {
        const { provider, input, fetch } = fixture();
        fetch.mockResolvedValueOnce(Response.json({ text: '', languages: [] }));
        await expect(provider.transcribe(input)).rejects.toThrow();
        fetch.mockResolvedValueOnce(
            Response.json({
                text: 'Transcript',
                languages: [],
                usage: { type: 'duration', seconds: -1 },
            }),
        );
        await expect(provider.transcribe(input)).rejects.toThrow('invalid');
        fetch.mockResolvedValueOnce(new Response('x'.repeat(512_001)));
        await expect(provider.transcribe(input)).rejects.toThrow('exceeds');
    });
});
