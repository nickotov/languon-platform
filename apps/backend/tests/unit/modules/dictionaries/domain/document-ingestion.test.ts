import { describe, expect, it } from 'vitest';

import {
    classifyDictionaryDocumentTerms,
    documentIngestionLimitsV1,
    type InvalidDictionaryDocumentExtractionError,
    validateDictionaryDocumentBlocks,
} from '../../../../../src/modules/dictionaries/domain/document-ingestion';

const location = (blockIndex: number) => ({ blockIndex, pageNumber: 1 });

describe('dictionary document ingestion domain', () => {
    it('exports the exact version-one security envelope', () => {
        expect(documentIngestionLimitsV1).toMatchObject({
            version: 1,
            upload: { capabilityTtlMs: 600_000, maximumFileBytes: 20_971_520 },
            document: {
                maximumPages: 100,
                maximumExtractedUnits: 100,
                maximumUnitCodePoints: 200,
                maximumExtractedUtf8Bytes: 1_048_576,
                maximumImageDimensionPixels: 16_384,
                maximumPagePixels: 25_000_000,
                maximumTotalPixels: 250_000_000,
            },
            zip: {
                maximumEntries: 2_048,
                maximumNestingDepth: 0,
                maximumExpandedBytes: 67_108_864,
                maximumExpansionRatio: 100,
            },
            parser: {
                maximumIpcOutputBytes: 2_097_152,
                wallTimeMs: 15_000,
                cpuTimeMs: 10_000,
                maximumRssBytes: 268_435_456,
                maximumPids: 8,
                maximumTemporaryBytes: 134_217_728,
            },
            scanner: {
                timeoutMs: 30_000,
                maximumStreamBytes: 26_214_400,
                maximumRecursionDepth: 10,
                maximumFiles: 2_048,
                maximumSignatureAgeMs: 86_400_000,
            },
            ocr: {
                maximumPageInputBytes: 8_388_608,
                maximumPagePixels: 25_000_000,
                pageTimeoutMs: 20_000,
                maximumPages: 100,
                maximumTotalPixels: 250_000_000,
                documentTimeoutMs: 120_000,
            },
        });
    });

    it('keeps explicit ordered terms while ignoring only headings and blanks', () => {
        expect(
            classifyDictionaryDocumentTerms([
                { kind: 'heading', location: location(0) },
                { kind: 'blank', location: location(1) },
                {
                    kind: 'list-item',
                    location: location(2),
                    text: '  12) bank  ',
                },
                {
                    kind: 'paragraph',
                    location: location(3),
                    text: 'river bank',
                },
                {
                    kind: 'table-row',
                    location: location(4),
                    cells: [' shore '],
                },
                {
                    kind: 'line',
                    location: location(5),
                    text: 'a sentence remains one phrase',
                },
            ]),
        ).toEqual({
            kind: 'review',
            failures: [],
            rows: [
                { input: 'bank', rowIndex: 0 },
                { input: 'river bank', rowIndex: 1 },
                { input: 'shore', rowIndex: 2 },
                { input: 'a sentence remains one phrase', rowIndex: 3 },
            ],
        });
    });

    it('retains sanitized failures without retaining invalid raw content', () => {
        const result = classifyDictionaryDocumentTerms([
            {
                kind: 'table-row',
                location: location(0),
                cells: ['source', 'translation'],
            },
            {
                kind: 'line',
                location: location(1),
                text: 'x'.repeat(201),
            },
            {
                kind: 'paragraph',
                location: location(2),
                text: 'unsafe\u0000term',
            },
        ]);

        expect(result).toMatchObject({
            kind: 'review',
            rows: [],
            failures: [
                { rowIndex: 0, input: '[Invalid extracted term]' },
                { rowIndex: 1, input: '[Invalid extracted term]' },
                { rowIndex: 2, input: '[Invalid extracted term]' },
            ],
        });
        expect(JSON.stringify(result)).not.toContain('x'.repeat(201));
        expect(JSON.stringify(result)).not.toContain('unsafe');
    });

    it('counts invalid units toward the hard maximum and never truncates', () => {
        expect(
            classifyDictionaryDocumentTerms(
                Array.from({ length: 100 }, (_, blockIndex) => ({
                    kind: 'line' as const,
                    location: location(blockIndex),
                    text:
                        blockIndex === 99
                            ? 'x'.repeat(201)
                            : `term ${blockIndex}`,
                })),
            ),
        ).toMatchObject({ kind: 'review' });
        expect(
            classifyDictionaryDocumentTerms(
                Array.from({ length: 101 }, (_, blockIndex) => ({
                    kind: 'line' as const,
                    location: location(blockIndex),
                    text: `term ${blockIndex}`,
                })),
            ),
        ).toEqual({ kind: 'too_many_terms', extractedUnits: 101 });
        expect(
            classifyDictionaryDocumentTerms([
                { kind: 'heading', location: location(0) },
                { kind: 'blank', location: location(1) },
            ]),
        ).toEqual({ kind: 'no_terms_found' });
    });

    it('rejects malformed and oversized parser IPC output', () => {
        expect(() =>
            validateDictionaryDocumentBlocks([
                {
                    kind: 'line',
                    location: { blockIndex: -1, pageNumber: 1 },
                    text: 'bank',
                },
            ]),
        ).toThrow();
        expect(() =>
            validateDictionaryDocumentBlocks([
                {
                    kind: 'line',
                    location: location(0),
                    text: 'x'.repeat(1_048_577),
                },
            ]),
        ).toThrowError(
            expect.objectContaining<
                Partial<InvalidDictionaryDocumentExtractionError>
            >({
                reason: 'extracted_text_limit',
            }),
        );
    });
});
