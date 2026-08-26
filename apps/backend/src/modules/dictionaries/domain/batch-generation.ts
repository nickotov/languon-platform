import { z } from 'zod';

import { DictionaryGenerationProposalPayloadSchema } from './generation';
import {
    dictionaryLimits,
    normalizeDictionaryCardSourceForSearch,
} from './limits';

export const dictionaryBatchGenerationLimits = {
    chunkRows: 20,
    maximumRows: 100,
    // Accommodates 100 maximum-length rows with CRLF separators while keeping
    // blank-line and transport amplification tightly bounded.
    maximumTextCodePoints: 20_200,
    rowCodePoints: dictionaryLimits.requiredCardValueCodePoints,
} as const;

export interface DictionaryBatchGenerationRow {
    input: string;
    rowIndex: number;
}

export type InvalidDictionaryBatchInputReason =
    | 'control_character'
    | 'no_rows'
    | 'row_too_long'
    | 'text_too_long'
    | 'too_many_rows';

export class InvalidDictionaryBatchInputError extends Error {
    public constructor(
        public readonly reason: InvalidDictionaryBatchInputReason,
        public readonly rowIndex: number | null = null,
    ) {
        super(
            rowIndex === null
                ? `The pasted dictionary input is invalid (${reason}).`
                : `Pasted dictionary row ${rowIndex} is invalid (${reason}).`,
        );
        this.name = 'InvalidDictionaryBatchInputError';
    }
}

function hasDisallowedControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0)!;

        return (
            codePoint <= 9 ||
            codePoint === 11 ||
            codePoint === 12 ||
            (codePoint >= 14 && codePoint <= 31) ||
            (codePoint >= 127 && codePoint <= 159)
        );
    });
}

export function parseDictionaryBatchGenerationText(
    text: string,
): DictionaryBatchGenerationRow[] {
    if (
        [...text].length > dictionaryBatchGenerationLimits.maximumTextCodePoints
    ) {
        throw new InvalidDictionaryBatchInputError('text_too_long');
    }
    if (hasDisallowedControlCharacter(text)) {
        throw new InvalidDictionaryBatchInputError('control_character');
    }

    const inputs = text
        .split(/\r\n|\n|\r/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (inputs.length === 0) {
        throw new InvalidDictionaryBatchInputError('no_rows');
    }
    if (inputs.length > dictionaryBatchGenerationLimits.maximumRows) {
        throw new InvalidDictionaryBatchInputError('too_many_rows');
    }

    return inputs.map((input, rowIndex) => {
        if ([...input].length > dictionaryBatchGenerationLimits.rowCodePoints) {
            throw new InvalidDictionaryBatchInputError(
                'row_too_long',
                rowIndex,
            );
        }

        return { input, rowIndex };
    });
}

export function chunkDictionaryBatchGenerationRows(
    rows: readonly DictionaryBatchGenerationRow[],
): DictionaryBatchGenerationRow[][] {
    if (rows.length > dictionaryBatchGenerationLimits.maximumRows) {
        throw new InvalidDictionaryBatchInputError('too_many_rows');
    }

    const chunks: DictionaryBatchGenerationRow[][] = [];
    for (
        let offset = 0;
        offset < rows.length;
        offset += dictionaryBatchGenerationLimits.chunkRows
    ) {
        chunks.push(
            rows
                .slice(
                    offset,
                    offset + dictionaryBatchGenerationLimits.chunkRows,
                )
                .map((row) => ({ ...row })),
        );
    }
    return chunks;
}

export interface DictionaryBatchExistingSource {
    cardId: string;
    source: string;
}

export interface DictionaryBatchDuplicateWarning {
    code: 'duplicate_source';
    duplicateCardId: string | null;
    message: string;
    rowIndex: number;
}

export function createDictionaryBatchDuplicateWarnings(
    rows: readonly DictionaryBatchGenerationRow[],
    existingSources: readonly DictionaryBatchExistingSource[] = [],
): DictionaryBatchDuplicateWarning[] {
    const existingBySource = new Map<string, string>();
    for (const existing of existingSources) {
        const key = normalizeDictionaryCardSourceForSearch(existing.source);
        if (!existingBySource.has(key)) {
            existingBySource.set(key, existing.cardId);
        }
    }

    const seenBatchSources = new Set<string>();
    const warnings: DictionaryBatchDuplicateWarning[] = [];
    for (const row of rows) {
        const key = normalizeDictionaryCardSourceForSearch(row.input);
        const duplicateCardId = existingBySource.get(key) ?? null;

        if (duplicateCardId !== null || seenBatchSources.has(key)) {
            warnings.push({
                code: 'duplicate_source',
                duplicateCardId,
                message:
                    duplicateCardId === null
                        ? 'A matching source appears earlier in this batch.'
                        : 'A matching source already exists in this dictionary.',
                rowIndex: row.rowIndex,
            });
        }
        seenBatchSources.add(key);
    }

    return warnings;
}

const boundedText = (maximumCodePoints: number) =>
    z
        .string()
        .trim()
        .min(1)
        .refine(
            (value) => [...value].length <= maximumCodePoints,
            `Text exceeds the ${maximumCodePoints} code point limit`,
        )
        .refine(
            (value) => !hasDisallowedControlCharacter(value),
            'Control characters are not allowed',
        );

const BatchProposalCandidateSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        input: boundedText(dictionaryBatchGenerationLimits.rowCodePoints),
        candidate: DictionaryGenerationProposalPayloadSchema.shape.candidate,
        fieldFeedback:
            DictionaryGenerationProposalPayloadSchema.shape.fieldFeedback,
    })
    .strict();

const BatchProposalFailureSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        input: boundedText(dictionaryBatchGenerationLimits.rowCodePoints),
        code: z.enum(['invalid_term', 'generation_failed']),
        message: boundedText(500),
        retryable: z.boolean(),
    })
    .strict();

const BatchProposalWarningSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(99),
        code: z.literal('duplicate_source'),
        message: boundedText(500),
        duplicateCardId: z.string().uuid().nullable().default(null),
    })
    .strict();

const DictionaryBatchGenerationProposalPayloadSchema = z
    .object({
        candidates: z.array(BatchProposalCandidateSchema).max(100),
        failures: z.array(BatchProposalFailureSchema).max(100),
        warnings: z.array(BatchProposalWarningSchema).max(100),
    })
    .strict()
    .superRefine((proposal, context) => {
        const resolvedIndexes = [
            ...proposal.candidates.map((candidate) => candidate.rowIndex),
            ...proposal.failures.map((failure) => failure.rowIndex),
        ];

        if (resolvedIndexes.length === 0) {
            context.addIssue({
                code: 'custom',
                message:
                    'A batch proposal must contain at least one resolved row',
            });
        }
        if (new Set(resolvedIndexes).size !== resolvedIndexes.length) {
            context.addIssue({
                code: 'custom',
                message: 'Candidate and failure row indexes must be unique',
            });
        }

        const resolvedIndexSet = new Set(resolvedIndexes);
        const warningKeys = new Set<string>();
        proposal.warnings.forEach((warning, warningIndex) => {
            const key = `${warning.rowIndex}:${warning.code}`;
            if (warningKeys.has(key)) {
                context.addIssue({
                    code: 'custom',
                    path: ['warnings', warningIndex],
                    message: 'Warning codes must be unique for each row',
                });
            }
            warningKeys.add(key);

            if (!resolvedIndexSet.has(warning.rowIndex)) {
                context.addIssue({
                    code: 'custom',
                    path: ['warnings', warningIndex, 'rowIndex'],
                    message: 'Warnings must reference a resolved row',
                });
            }
        });
    });

export type DictionaryBatchGenerationProposalPayload = z.infer<
    typeof DictionaryBatchGenerationProposalPayloadSchema
>;

export function parseDictionaryBatchGenerationProposal(
    value: unknown,
): DictionaryBatchGenerationProposalPayload {
    return DictionaryBatchGenerationProposalPayloadSchema.parse(value);
}

const ImportPairsProposalCandidateSchema = z
    .object({
        rowIndex: z.number().int().min(0).max(9_999),
        source: boundedText(dictionaryBatchGenerationLimits.rowCodePoints),
        translation: boundedText(dictionaryBatchGenerationLimits.rowCodePoints),
        candidate: DictionaryGenerationProposalPayloadSchema.shape.candidate,
        fieldFeedback:
            DictionaryGenerationProposalPayloadSchema.shape.fieldFeedback,
    })
    .strict()
    .superRefine((row, context) => {
        if (row.candidate.values.source !== row.source)
            context.addIssue({
                code: 'custom',
                path: ['candidate', 'values', 'source'],
                message: 'AI output must preserve the imported source',
            });
        if (row.candidate.values.translation !== row.translation)
            context.addIssue({
                code: 'custom',
                path: ['candidate', 'values', 'translation'],
                message: 'AI output must preserve the imported translation',
            });
        if (
            row.fieldFeedback.some(
                (feedback) =>
                    feedback.field === 'source' ||
                    feedback.field === 'translation',
            )
        )
            context.addIssue({
                code: 'custom',
                path: ['fieldFeedback'],
                message: 'AI may only provide feedback for optional fields',
            });
    });

export const DictionaryImportPairsGenerationProposalPayloadSchema = z
    .object({
        candidates: z.array(ImportPairsProposalCandidateSchema).max(100),
        failures: z
            .array(
                z
                    .object({
                        rowIndex: z.number().int().min(0).max(9_999),
                        input: boundedText(
                            dictionaryBatchGenerationLimits.rowCodePoints,
                        ),
                        source: boundedText(
                            dictionaryBatchGenerationLimits.rowCodePoints,
                        ),
                        translation: boundedText(
                            dictionaryBatchGenerationLimits.rowCodePoints,
                        ),
                        code: z.enum(['invalid_term', 'generation_failed']),
                        message: boundedText(500),
                        retryable: z.boolean(),
                    })
                    .strict(),
            )
            .max(100),
        warnings: z
            .array(
                BatchProposalWarningSchema.extend({
                    rowIndex: z.number().int().min(0).max(9_999),
                }),
            )
            .max(100),
    })
    .strict()
    .superRefine((proposal, context) => {
        const resolved = [
            ...proposal.candidates.map((row) => row.rowIndex),
            ...proposal.failures.map((row) => row.rowIndex),
        ];
        proposal.failures.forEach((failure, index) => {
            if (failure.input !== failure.source)
                context.addIssue({
                    code: 'custom',
                    path: ['failures', index, 'input'],
                    message: 'Failure input must preserve the imported source',
                });
        });
        if (resolved.length === 0)
            context.addIssue({
                code: 'custom',
                message: 'An import-pairs proposal requires a resolved row',
            });
        if (new Set(resolved).size !== resolved.length)
            context.addIssue({
                code: 'custom',
                message: 'Import-pairs row indexes must be unique',
            });
        const resolvedSet = new Set(resolved);
        const warningKeys = new Set<string>();
        proposal.warnings.forEach((warning, index) => {
            const key = `${warning.rowIndex}:${warning.code}`;
            if (!resolvedSet.has(warning.rowIndex) || warningKeys.has(key))
                context.addIssue({
                    code: 'custom',
                    path: ['warnings', index],
                    message:
                        'Import-pairs warnings must be unique and resolved',
                });
            warningKeys.add(key);
        });
    });

export type DictionaryImportPairsGenerationProposalPayload = z.infer<
    typeof DictionaryImportPairsGenerationProposalPayloadSchema
>;

export function parseDictionaryImportPairsGenerationProposal(
    value: unknown,
): DictionaryImportPairsGenerationProposalPayload {
    return DictionaryImportPairsGenerationProposalPayloadSchema.parse(value);
}
