import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DictionaryDocumentGenerationProcessor } from '../../../../../src/modules/dictionaries/application/dictionary-document-generation-processor';
import type { DictionaryGenerationProviderBudgetPolicy } from '../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import type { DictionaryDocumentMediaType } from '../../../../../src/modules/dictionaries/domain/document-ingestion';
import { DeterministicPastedTermsProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import {
    DeterministicPrivateDocumentStorage,
    DeterministicDocumentMalwareScanner,
    DeterministicDocumentOcrProvider,
    DeterministicSandboxedDocumentExtractor,
} from '../../../../../src/modules/dictionaries/infrastructure/document/deterministic-document-adapters';

const now = new Date('2026-08-26T12:00:00.000Z');
const providerBudget: DictionaryGenerationProviderBudgetPolicy = {
    inputCostMicrosPerMillionTokens: 1_000_000,
    maxCostMicrosPerAttempt: 1_000_000,
    maxInputTokensPerAttempt: 262_144,
    maxOutputTokensPerAttempt: 40_960,
    outputCostMicrosPerMillionTokens: 1_000_000,
};

const effectiveSettings = {
    definitionEnabled: true,
    definitionLanguage: 'target' as const,
    exampleEnabled: true,
    exampleLanguage: 'source' as const,
    exampleTranslationEnabled: true,
    exampleTranslationLanguage: 'target' as const,
    transcriptionCustomLabel: null,
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa' as const,
};

function fixture(
    bytes: Uint8Array,
    contentType: DictionaryDocumentMediaType = 'text/plain',
) {
    const reference = {
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        contentType,
        objectKey: 'dictionary-documents/owner/upload',
        sizeBytes: bytes.byteLength,
        storageVersionId: 'version-1',
        uploadId: '11111111-1111-4111-8111-111111111111',
    };
    return {
        input: {
            context: {
                dictionaryId: '22222222-2222-4222-8222-222222222222',
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
            effectiveSettings,
            format: 'document-terms:v1' as const,
            instruction: null,
            uploadId: reference.uploadId,
        },
        reference,
        storage: new DeterministicPrivateDocumentStorage([
            { bytes, reference },
        ]),
    };
}

function processor(input: {
    extractor?: DeterministicSandboxedDocumentExtractor;
    ocr?: DeterministicDocumentOcrProvider;
    proposalGenerator?: DeterministicPastedTermsProposalGenerator;
    scanner?: DeterministicDocumentMalwareScanner;
    storage: DeterministicPrivateDocumentStorage;
}) {
    return new DictionaryDocumentGenerationProcessor({
        clock: { now: () => now },
        extractor:
            input.extractor ?? new DeterministicSandboxedDocumentExtractor(),
        fingerprint: {
            fingerprint: () =>
                'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        },
        ocr: input.ocr ?? new DeterministicDocumentOcrProvider(),
        proposalGenerator:
            input.proposalGenerator ??
            new DeterministicPastedTermsProposalGenerator(),
        scanner: input.scanner ?? new DeterministicDocumentMalwareScanner(),
        storage: input.storage,
    });
}

function request(fixtureValue: ReturnType<typeof fixture>) {
    return {
        idempotencyKey: 'job-1/document',
        input: fixtureValue.input,
        object: fixtureValue.reference,
        providerBudget,
        signal: new AbortController().signal,
    };
}

describe('DictionaryDocumentGenerationProcessor', () => {
    it('scans exact bytes, extracts ordered terms, and reuses batch enrichment', async () => {
        const value = fixture(new TextEncoder().encode('bank\nriver bank'));
        const stages: string[] = [];
        const result = await processor(value).process({
            ...request(value),
            reportStage: (stage) => {
                stages.push(stage);
                return Promise.resolve();
            },
        });

        expect(result.proposal.candidates.map((row) => row.input)).toEqual([
            'bank',
            'river bank',
        ]);
        expect(result.proposal.failures).toEqual([]);
        expect(result.providerUsage).toEqual({
            inputTokens: 0,
            outputTokens: 0,
        });
        expect(stages).toEqual([
            'scanning',
            'extracting',
            'generating',
            'validating',
        ]);
    });

    it('returns an all-invalid failure-only review without a paid call', async () => {
        const value = fixture(new TextEncoder().encode('x'.repeat(201)));
        const generate = vi.fn();
        const result = await processor({
            storage: value.storage,
            proposalGenerator: {
                generate,
                readiness: () => Promise.resolve(),
            } as unknown as DeterministicPastedTermsProposalGenerator,
        }).process(request(value));

        expect(generate).not.toHaveBeenCalled();
        expect(result.proposal.candidates).toEqual([]);
        expect(result.proposal.failures).toEqual([
            expect.objectContaining({
                code: 'invalid_term',
                input: '[Invalid extracted term]',
                rowIndex: 0,
            }),
        ]);
    });

    it('uses bounded OCR only when the extractor requests it', async () => {
        const value = fixture(
            new TextEncoder().encode('bank\nshore'),
            'image/png',
        );
        const stages: string[] = [];
        const result = await processor(value).process({
            ...request(value),
            reportStage: (stage) => {
                stages.push(stage);
                return Promise.resolve();
            },
        });

        expect(result.proposal.candidates.map((row) => row.input)).toEqual([
            'bank',
            'shore',
        ]);
        expect(stages).toContain('ocr');
    });

    it('fails closed before extraction when scan is non-clean', async () => {
        const value = fixture(new TextEncoder().encode('bank'));
        const extract = vi.fn();
        const scanner = new DeterministicDocumentMalwareScanner(async () => ({
            attestation: {
                engineVersion: 'deterministic-1',
                signatureUpdatedAt: now,
                signatureVersion: 'deterministic-signatures-1',
            },
            kind: 'infected',
        }));

        await expect(
            processor({
                storage: value.storage,
                scanner,
                extractor: {
                    extract,
                } as unknown as DeterministicSandboxedDocumentExtractor,
            }).process(request(value)),
        ).rejects.toMatchObject({
            category: 'malware_detected',
            retryable: false,
        });
        expect(extract).not.toHaveBeenCalled();
    });

    it('preserves clean scan evidence when extraction fails', async () => {
        const value = fixture(new TextEncoder().encode('bank'));
        const extractor = {
            extract: vi.fn(async () => {
                throw new Error('sandbox timed out');
            }),
        } as unknown as DeterministicSandboxedDocumentExtractor;

        await expect(
            processor({ ...value, extractor }).process(request(value)),
        ).rejects.toMatchObject({
            category: 'extraction_failed',
            retryable: false,
            scanAttestation: {
                completedAt: now,
                engineVersion: 'deterministic-1',
                signatureUpdatedAt: new Date('2026-08-26T00:00:00.000Z'),
                signatureVersion: 'deterministic-signatures-1',
            },
        });
    });

    it('rejects changed bytes and count overflow without model work', async () => {
        const changed = fixture(new TextEncoder().encode('bank'));
        changed.reference.checksumSha256 = '0'.repeat(64);
        await expect(
            processor(changed).process(request(changed)),
        ).rejects.toMatchObject({
            category: 'invalid_document',
        });

        const overflow = fixture(
            new TextEncoder().encode(
                Array.from({ length: 101 }, (_, index) => `term ${index}`).join(
                    '\n',
                ),
            ),
        );
        await expect(
            processor(overflow).process(request(overflow)),
        ).rejects.toMatchObject({
            category: 'too_many_terms',
            retryable: false,
        });
    });

    it('returns the recoverable no-terms outcome and honors cancellation', async () => {
        const empty = fixture(new TextEncoder().encode('\n'));
        await expect(
            processor(empty).process(request(empty)),
        ).rejects.toMatchObject({
            category: 'no_terms_found',
            retryable: false,
        });

        const cancelled = fixture(new TextEncoder().encode('bank'));
        const controller = new AbortController();
        controller.abort(new DOMException('shutdown', 'AbortError'));
        await expect(
            processor(cancelled).process({
                ...request(cancelled),
                signal: controller.signal,
            }),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('provides crash-resumable deterministic tombstone cleanup operations', async () => {
        const value = fixture(new TextEncoder().encode('bank'));
        const signal = new AbortController().signal;
        const tombstone = await value.storage.putTombstone({
            objectKey: value.reference.objectKey,
            signal,
        });
        let versions = await value.storage.listVersions({
            objectKey: value.reference.objectKey,
            signal,
        });
        expect(versions.map((version) => version.kind)).toEqual([
            'data',
            'tombstone',
        ]);
        await value.storage.deleteVersion({
            objectKey: value.reference.objectKey,
            signal,
            versionId: value.reference.storageVersionId,
        });
        versions = await value.storage.listVersions({
            objectKey: value.reference.objectKey,
            signal,
        });
        expect(versions).toEqual([tombstone]);
        await value.storage.deleteTombstone({
            objectKey: value.reference.objectKey,
            signal,
            versionId: tombstone.versionId,
        });
        expect(
            await value.storage.listVersions({
                objectKey: value.reference.objectKey,
                signal,
            }),
        ).toEqual([]);
    });
});
