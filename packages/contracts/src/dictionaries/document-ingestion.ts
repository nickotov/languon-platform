import { z } from 'zod';

export const dictionaryDocumentMediaTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/markdown',
    'text/plain',
] as const;

export const DictionaryDocumentMediaTypeSchema = z.enum(
    dictionaryDocumentMediaTypes,
);

export const documentIngestionLimitsV1 = {
    version: 1,
    upload: {
        capabilityTtlMs: 10 * 60 * 1_000,
        maximumFileBytes: 20 * 1_024 * 1_024,
    },
    document: {
        maximumPages: 100,
        maximumExtractedUnits: 100,
        maximumUnitCodePoints: 200,
        maximumExtractedUtf8Bytes: 1 * 1_024 * 1_024,
        maximumImageDimensionPixels: 16_384,
        maximumPagePixels: 25_000_000,
        maximumTotalPixels: 250_000_000,
    },
    zip: {
        maximumEntries: 2_048,
        maximumNestingDepth: 0,
        maximumExpandedBytes: 64 * 1_024 * 1_024,
        maximumExpansionRatio: 100,
    },
    parser: {
        maximumIpcOutputBytes: 2 * 1_024 * 1_024,
        wallTimeMs: 15_000,
        cpuTimeMs: 10_000,
        maximumRssBytes: 256 * 1_024 * 1_024,
        maximumPids: 8,
        maximumTemporaryBytes: 128 * 1_024 * 1_024,
    },
    scanner: {
        timeoutMs: 30_000,
        maximumStreamBytes: 25 * 1_024 * 1_024,
        maximumRecursionDepth: 10,
        maximumFiles: 2_048,
        maximumSignatureAgeMs: 24 * 60 * 60 * 1_000,
    },
    ocr: {
        maximumPageInputBytes: 8 * 1_024 * 1_024,
        maximumPagePixels: 25_000_000,
        pageTimeoutMs: 20_000,
        maximumPages: 100,
        maximumTotalPixels: 250_000_000,
        documentTimeoutMs: 120_000,
    },
} as const;

export type DictionaryDocumentMediaType = z.infer<
    typeof DictionaryDocumentMediaTypeSchema
>;
