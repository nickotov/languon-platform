import { describe, expect, it } from 'vitest';

import {
    chunkDictionaryBatchGenerationRows,
    createDictionaryBatchDuplicateWarnings,
    type InvalidDictionaryBatchInputError,
    parseDictionaryBatchGenerationProposal,
    parseDictionaryBatchGenerationText,
} from '../../../../../src/modules/dictionaries/domain/batch-generation';
import { DictionaryImportPairsGenerationInputPayloadSchema } from '../../../../../src/modules/dictionaries/domain/generation';

describe('dictionary pasted-term batch generation', () => {
    it('validates trusted import-pairs lineage and requires optional enrichment', () => {
        const fingerprint =
            'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const input = {
            effectiveSettings: {
                transcriptionCustomLabel: null,
                definitionEnabled: true,
                definitionLanguage: 'target',
                exampleEnabled: false,
                exampleLanguage: 'source',
                exampleTranslationEnabled: false,
                exampleTranslationLanguage: 'target',
                transcriptionEnabled: false,
                transcriptionNotation: 'ipa',
            },
            format: 'import-pairs:v1',
            importFingerprint: fingerprint,
            instruction: null,
            context: {
                dictionaryId: '11111111-1111-4111-8111-111111111111',
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'es',
            },
            rows: [
                {
                    lineage: {
                        importFingerprint: fingerprint,
                        importedRowIndex: 88,
                    },
                    rowIndex: 88,
                    source: 'bank',
                    translation: 'banco',
                },
            ],
        };
        expect(
            DictionaryImportPairsGenerationInputPayloadSchema.parse(input),
        ).toBeTruthy();
        expect(() =>
            DictionaryImportPairsGenerationInputPayloadSchema.parse({
                ...input,
                rows: [
                    {
                        ...input.rows[0],
                        lineage: {
                            ...input.rows[0]!.lineage,
                            importedRowIndex: 87,
                        },
                    },
                ],
            }),
        ).toThrow();
        expect(() =>
            DictionaryImportPairsGenerationInputPayloadSchema.parse({
                ...input,
                effectiveSettings: {
                    ...input.effectiveSettings,
                    definitionEnabled: false,
                },
            }),
        ).toThrow();
    });

    it('parses trimmed non-empty lines with stable row indexes and order', () => {
        expect(
            parseDictionaryBatchGenerationText(
                '  bank  \r\n\r\n river bank \n  shore  ',
            ),
        ).toEqual([
            { input: 'bank', rowIndex: 0 },
            { input: 'river bank', rowIndex: 1 },
            { input: 'shore', rowIndex: 2 },
        ]);
        expect(parseDictionaryBatchGenerationText('bank\rriver')).toEqual([
            { input: 'bank', rowIndex: 0 },
            { input: 'river', rowIndex: 1 },
        ]);
    });

    it('counts Unicode code points and rejects invalid or unbounded input', () => {
        expect(
            parseDictionaryBatchGenerationText('😀'.repeat(200)),
        ).toHaveLength(1);
        expect(() =>
            parseDictionaryBatchGenerationText('😀'.repeat(201)),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'row_too_long',
                rowIndex: 0,
            }),
        );
        expect(() =>
            parseDictionaryBatchGenerationText('safe\u0000unsafe'),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'control_character',
            }),
        );
        expect(() =>
            parseDictionaryBatchGenerationText('safe\tunsafe'),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'control_character',
            }),
        );
        expect(() =>
            parseDictionaryBatchGenerationText('safe\u0085unsafe'),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'control_character',
            }),
        );
        expect(
            parseDictionaryBatchGenerationText(
                Array.from({ length: 100 }, () => 'x'.repeat(200)).join('\r\n'),
            ),
        ).toHaveLength(100);
        expect(() =>
            parseDictionaryBatchGenerationText('x'.repeat(20_201)),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'text_too_long',
            }),
        );
        expect(() =>
            parseDictionaryBatchGenerationText('\n \r\n'),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'no_rows',
            }),
        );
        expect(() =>
            parseDictionaryBatchGenerationText(
                Array.from({ length: 101 }, (_, index) => `row ${index}`).join(
                    '\n',
                ),
            ),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryBatchInputError>>({
                reason: 'too_many_rows',
            }),
        );
    });

    it('chunks rows into deterministic groups of twenty without changing rows', () => {
        const rows = parseDictionaryBatchGenerationText(
            Array.from({ length: 41 }, (_, index) => `row ${index}`).join('\n'),
        );

        const chunks = chunkDictionaryBatchGenerationRows(rows);

        expect(chunks.map((chunk) => chunk.length)).toEqual([20, 20, 1]);
        expect(chunks.flat()).toEqual(rows);
        expect(chunks[1]?.[0]).toEqual({ input: 'row 20', rowIndex: 20 });
    });

    it('warns about normalized existing and in-batch duplicates without rejecting rows', () => {
        const rows = parseDictionaryBatchGenerationText(
            'ＢＡＮＫ\n bank \nRiver\nRIVER',
        );

        expect(
            createDictionaryBatchDuplicateWarnings(rows, [
                {
                    cardId: '11111111-1111-4111-8111-111111111111',
                    source: 'bank',
                },
            ]),
        ).toEqual([
            {
                code: 'duplicate_source',
                duplicateCardId: '11111111-1111-4111-8111-111111111111',
                message: 'A matching source already exists in this dictionary.',
                rowIndex: 0,
            },
            {
                code: 'duplicate_source',
                duplicateCardId: '11111111-1111-4111-8111-111111111111',
                message: 'A matching source already exists in this dictionary.',
                rowIndex: 1,
            },
            {
                code: 'duplicate_source',
                duplicateCardId: null,
                message: 'A matching source appears earlier in this batch.',
                rowIndex: 3,
            },
        ]);
        expect(rows).toHaveLength(4);
    });

    it('validates bounded candidates, failures, warnings, and unique resolved row indexes', () => {
        const candidate = {
            overrides: {
                transcriptionCustomLabel: null,
                definitionEnabled: null,
                definitionLanguage: null,
                exampleEnabled: null,
                exampleLanguage: null,
                exampleTranslationEnabled: null,
                transcriptionEnabled: null,
                transcriptionNotation: null,
            },
            values: {
                definition: null,
                example: null,
                exampleTranslation: null,
                source: 'bank',
                transcription: null,
                translation: 'banco',
            },
        };
        const proposal = {
            candidates: [
                {
                    rowIndex: 0,
                    input: 'bank',
                    candidate,
                    fieldFeedback: [],
                },
            ],
            failures: [
                {
                    rowIndex: 1,
                    input: 'river bank',
                    code: 'generation_failed' as const,
                    message: 'Could not generate this row.',
                    retryable: true,
                },
            ],
            warnings: [
                {
                    rowIndex: 0,
                    code: 'duplicate_source' as const,
                    message: 'A matching source already exists.',
                    duplicateCardId: '11111111-1111-4111-8111-111111111111',
                },
            ],
        };

        expect(parseDictionaryBatchGenerationProposal(proposal)).toEqual(
            proposal,
        );
        expect(() =>
            parseDictionaryBatchGenerationProposal({
                ...proposal,
                failures: [{ ...proposal.failures[0], rowIndex: 0 }],
            }),
        ).toThrow();
        expect(() =>
            parseDictionaryBatchGenerationProposal({
                candidates: Array.from({ length: 101 }, (_, rowIndex) => ({
                    rowIndex,
                    input: `row ${rowIndex}`,
                    candidate,
                    fieldFeedback: [],
                })),
                failures: [],
                warnings: [],
            }),
        ).toThrow();
        expect(() =>
            parseDictionaryBatchGenerationProposal({
                ...proposal,
                warnings: [{ ...proposal.warnings[0], rowIndex: 2 }],
            }),
        ).toThrow();
    });
});
