import { describe, expect, it } from 'vitest';

import {
    dictionaryInterchangeLimitsV1,
    DictionaryImportPairsGenerationProposalSchema,
    ExportDictionaryResponseHeadersSchema,
    ImportDictionaryRequestSchema,
    PreviewDictionaryImportRequestSchema,
    PreviewDictionaryImportResponseSchema,
} from '../src/dictionaries';

const existingTarget = {
    kind: 'existing' as const,
    dictionaryId: '11111111-1111-4111-8111-111111111111',
    expectedDictionaryVersion: 2,
    expectedSettingsVersion: 3,
};

describe('dictionary interchange contracts', () => {
    it('requires a full preview target and rejects deterministic row selection', () => {
        const request = {
            content: 'bank,banco',
            options: {
                delimiter: 'comma',
                hasHeader: false,
                sourceColumnIndex: 0,
                targetColumnIndex: 1,
            },
            target: existingTarget,
        };
        expect(PreviewDictionaryImportRequestSchema.parse(request)).toEqual(
            request,
        );
        expect(() =>
            ImportDictionaryRequestSchema.parse({
                ...request,
                enrichment: { mode: 'none' },
                selectedRowIndexes: [0],
            }),
        ).toThrow();
    });

    it('makes advisory target capacity observable and internally consistent', () => {
        const response = {
            capacity: { remainingRows: 1, wouldExceed: true },
            columns: [],
            failures: [],
            rows: [],
            summary: {
                duplicateRows: 0,
                failureRows: 0,
                readyRows: 2,
                totalRows: 2,
                truncated: false,
            },
            warnings: [],
        };
        expect(PreviewDictionaryImportResponseSchema.parse(response)).toEqual(
            response,
        );
        expect(() =>
            PreviewDictionaryImportResponseSchema.parse({
                ...response,
                capacity: { remainingRows: 2, wouldExceed: true },
            }),
        ).toThrow();
    });

    it('bounds AI enrichment to 100 explicitly selected unique rows', () => {
        const base = {
            content: 'bank,banco',
            options: {
                delimiter: 'comma' as const,
                hasHeader: false,
                sourceColumnIndex: 0,
                targetColumnIndex: 1,
            },
            target: existingTarget,
        };
        expect(
            ImportDictionaryRequestSchema.parse({
                ...base,
                enrichment: {
                    mode: 'ai',
                    instruction: null,
                    selectedRowIndexes: [0],
                },
            }).enrichment.mode,
        ).toBe('ai');
        for (const selectedRowIndexes of [
            [],
            [0, 0],
            Array.from({ length: 101 }, (_, index) => index),
        ])
            expect(() =>
                ImportDictionaryRequestSchema.parse({
                    ...base,
                    enrichment: {
                        mode: 'ai',
                        instruction: null,
                        selectedRowIndexes,
                    },
                }),
            ).toThrow();
    });

    it('rejects invalid JSON text and measures the UTF-8 byte boundary', () => {
        const base = {
            options: {
                delimiter: 'tab' as const,
                hasHeader: false,
                sourceColumnIndex: 0,
                targetColumnIndex: 1,
            },
            target: existingTarget,
        };
        for (const content of ['safe\0unsafe', 'safe\u0085unsafe', '\ud800'])
            expect(() =>
                PreviewDictionaryImportRequestSchema.parse({
                    ...base,
                    content,
                }),
            ).toThrow();
        expect(() =>
            PreviewDictionaryImportRequestSchema.parse({
                ...base,
                content: '😀'.repeat(
                    dictionaryInterchangeLimitsV1.maximumInputUtf8Bytes / 4,
                ),
            }),
        ).not.toThrow();
        expect(() =>
            PreviewDictionaryImportRequestSchema.parse({
                ...base,
                content: `${'😀'.repeat(
                    dictionaryInterchangeLimitsV1.maximumInputUtf8Bytes / 4,
                )}a`,
            }),
        ).toThrow();
    });

    it('requires private no-store export headers including referrer isolation', () => {
        expect(
            ExportDictionaryResponseHeadersSchema.parse({
                'cache-control': 'private, no-store',
                'content-disposition': 'attachment; filename="dictionary.csv"',
                'content-type': 'text/csv; charset=utf-8',
                'referrer-policy': 'no-referrer',
                'x-content-type-options': 'nosniff',
            }),
        ).toBeTruthy();
    });

    it('rejects model changes to trusted imported source and translation', () => {
        const proposal = {
            candidates: [
                {
                    rowIndex: 7,
                    source: 'bank',
                    translation: 'banco',
                    candidate: {
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
                            source: 'river bank',
                            transcription: null,
                            translation: 'banco',
                        },
                    },
                    fieldFeedback: [],
                },
            ],
            failures: [],
            warnings: [],
        };
        expect(() =>
            DictionaryImportPairsGenerationProposalSchema.parse(proposal),
        ).toThrow();
        proposal.candidates[0]!.candidate.values.source = 'bank';
        expect(() =>
            DictionaryImportPairsGenerationProposalSchema.parse(proposal),
        ).not.toThrow();
    });
});
