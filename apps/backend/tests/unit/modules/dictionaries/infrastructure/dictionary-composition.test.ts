import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrizzleDictionaryGenerationStore } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/drizzle-dictionary-generation-store';
import { createDictionaryComposition } from '../../../../../src/modules/dictionaries/infrastructure/dictionary-composition';
import { AuthHttpPolicy } from '../../../../../src/modules/authentication/interface/http/auth-http-policy';
import { DictionaryGenerationNotAvailableError } from '../../../../../src/modules/dictionaries/application/dictionary-errors';

function compose(accounting?: boolean) {
    const database = { transaction: vi.fn() };
    const dependencies: Parameters<typeof createDictionaryComposition>[0] = {
        accessTokens: {
            sign: async () => 'synthetic-token',
            verify: async () =>
                ({ sessionId: 'session', userId: 'owner' }) as never,
        },
        authentication: {
            requireActiveSession: async () => ({
                account: {} as never,
                session: {} as never,
            }),
            requireRecentlyAuthenticatedSession: async () => ({
                account: {} as never,
                session: {} as never,
            }),
        },
        clock: { now: () => new Date('2026-01-01T00:00:00Z') },
        database: database as never,
        entropy: { randomBytes: (length) => new Uint8Array(length).fill(1) },
        dictionaryHmacSecret:
            'synthetic-composition-secret-with-thirty-two-bytes',
        ids: { generate: () => '00000000-0000-4000-8000-000000000001' },
        generation: {
            acceptableFormats: ['single-card:v2'],
            cancellableFormats: ['single-card:v2'],
            discardableFormats: ['single-card:v2'],
            readableFormats: ['single-card:v2'],
            enqueuedFormats: [
                'single-card:v2',
                'card-authoring:v3',
                'document-terms:v1',
                'import-pairs:v1',
                'pasted-terms:v1',
            ],
            documentOcrAvailable: true,
        },
        ...(accounting === undefined
            ? {}
            : { aiCreditEnforcementEnabled: accounting }),
        policy: new AuthHttpPolicy({
            allowedOrigins: ['http://localhost:3333'],
            appEnvironment: 'test',
            refreshTokenTtlSeconds: 3600,
        }),
        rateLimiter: {
            consume: async () => ({
                allowed: true,
                limit: 100,
                remaining: 99,
                retryAfterSeconds: 1,
            }),
            linkSubject: async () => undefined,
        },
    };
    return { ...createDictionaryComposition(dependencies), database };
}
const context = () => ({
    clientAddress: '127.0.0.1',
    now: new Date('2026-01-01T00:00:00Z'),
    signal: new AbortController().signal,
});
describe('dictionary API accounting admission fence', () => {
    afterEach(() => vi.restoreAllMocks());
    it('keeps existing jobs readable and cancellable while new admission is disabled', async () => {
        const job = { id: 'job', format: 'single-card:v2' };
        vi.spyOn(
            DrizzleDictionaryGenerationStore.prototype,
            'read',
        ).mockResolvedValue(job as never);
        const cancel = vi
            .spyOn(DrizzleDictionaryGenerationStore.prototype, 'cancel')
            .mockResolvedValue(job as never);
        const composition = compose(false);
        await expect(
            composition.generationService.read('token', 'job', context()),
        ).resolves.toEqual(job);
        await expect(
            composition.generationService.cancel('token', 'job', context()),
        ).resolves.toEqual(job);
        expect(cancel).toHaveBeenCalledOnce();
    });

    it.each([undefined, false])(
        'disables new generation when accounting is %s without reaching persistence',
        async (accounting) => {
            const composition = compose(accounting);
            const capabilities =
                await composition.generationService.capabilities(
                    'token',
                    context(),
                );
            expect(
                Object.values(capabilities).every(
                    (capability) => !capability.available,
                ),
            ).toBe(true);
            await expect(
                composition.generationService.enqueue(
                    'token',
                    'operation',
                    'dictionary',
                    'card',
                    {} as never,
                    context(),
                ),
            ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
            expect(composition.database.transaction).not.toHaveBeenCalled();
        },
    );
    it('advertises configured new generation when accounting is enabled', async () => {
        const composition = compose(true);
        const capabilities = await composition.generationService.capabilities(
            'token',
            context(),
        );
        expect(capabilities.singleCardGeneration.available).toBe(true);
        expect(capabilities.documentTermsGeneration.available).toBe(true);
    });
});
