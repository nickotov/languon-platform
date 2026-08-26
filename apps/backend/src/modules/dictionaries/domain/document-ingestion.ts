import { Buffer } from 'node:buffer';
import {
    DICTIONARY_DOCUMENT_TERMS_GENERATION_FORMAT,
    dictionaryDocumentMediaTypes,
    documentIngestionLimitsV1,
    type DictionaryDocumentMediaType,
} from '@languon/contracts';
import { z } from 'zod';

export const dictionaryDocumentGenerationFormat =
    DICTIONARY_DOCUMENT_TERMS_GENERATION_FORMAT;
export const dictionaryDocumentGenerationKind = 'document-terms' as const;
export {
    dictionaryDocumentMediaTypes,
    documentIngestionLimitsV1,
    type DictionaryDocumentMediaType,
};

export type DictionaryDocumentBlock =
    | {
          kind: 'blank';
          location: DictionaryDocumentUnitLocation;
      }
    | {
          kind: 'heading';
          location: DictionaryDocumentUnitLocation;
      }
    | {
          kind: 'line';
          location: DictionaryDocumentUnitLocation;
          text: string;
      }
    | {
          kind: 'list-item';
          location: DictionaryDocumentUnitLocation;
          text: string;
      }
    | {
          kind: 'paragraph';
          location: DictionaryDocumentUnitLocation;
          text: string;
      }
    | {
          cells: string[];
          kind: 'table-row';
          location: DictionaryDocumentUnitLocation;
      };

export interface DictionaryDocumentUnitLocation {
    blockIndex: number;
    pageNumber: number | null;
}

const DictionaryDocumentUnitLocationSchema = z
    .object({
        blockIndex: z.number().int().min(0),
        pageNumber: z.number().int().min(1).max(100).nullable(),
    })
    .strict();

const extractedText = z
    .string()
    .max(documentIngestionLimitsV1.parser.maximumIpcOutputBytes);

export const DictionaryDocumentBlockSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('blank'),
            location: DictionaryDocumentUnitLocationSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('heading'),
            location: DictionaryDocumentUnitLocationSchema,
        })
        .strict(),
    ...(['line', 'list-item', 'paragraph'] as const).map((kind) =>
        z
            .object({
                kind: z.literal(kind),
                location: DictionaryDocumentUnitLocationSchema,
                text: extractedText,
            })
            .strict(),
    ),
    z
        .object({
            cells: z.array(extractedText).max(100),
            kind: z.literal('table-row'),
            location: DictionaryDocumentUnitLocationSchema,
        })
        .strict(),
]);

export interface DictionaryDocumentTermRow {
    input: string;
    rowIndex: number;
}

export interface DictionaryDocumentTermFailure {
    code: 'invalid_term';
    input: string;
    message: string;
    retryable: false;
    rowIndex: number;
}

export type DictionaryDocumentTermExtractionResult =
    | { kind: 'no_terms_found' }
    | { kind: 'too_many_terms'; extractedUnits: number }
    | {
          failures: DictionaryDocumentTermFailure[];
          kind: 'review';
          rows: DictionaryDocumentTermRow[];
      };

function hasDisallowedControlCharacter(value: string): boolean {
    return [...value].some((character) => {
        const codePoint = character.codePointAt(0)!;
        return (
            codePoint <= 8 ||
            codePoint === 11 ||
            codePoint === 12 ||
            (codePoint >= 14 && codePoint <= 31) ||
            (codePoint >= 127 && codePoint <= 159)
        );
    });
}

function stripListMarker(value: string): string {
    return value.replace(/^\s*(?:[-+*]|\d{1,9}[.)])\s+/u, '').trim();
}

function invalidFailure(rowIndex: number, message: string) {
    return {
        code: 'invalid_term' as const,
        input: '[Invalid extracted term]',
        message,
        retryable: false as const,
        rowIndex,
    };
}

/** Converts already-structured parser/OCR output into explicit ordered terms. */
export function classifyDictionaryDocumentTerms(
    blocks: readonly DictionaryDocumentBlock[],
): DictionaryDocumentTermExtractionResult {
    const units = blocks.filter(
        (block) => block.kind !== 'blank' && block.kind !== 'heading',
    );
    if (units.length === 0) return { kind: 'no_terms_found' };
    if (units.length > documentIngestionLimitsV1.document.maximumExtractedUnits)
        return { kind: 'too_many_terms', extractedUnits: units.length };

    const rows: DictionaryDocumentTermRow[] = [];
    const failures: DictionaryDocumentTermFailure[] = [];
    for (const [rowIndex, unit] of units.entries()) {
        let tableCell: string | undefined;
        if (unit.kind === 'table-row') {
            const cells = unit.cells.map((cell) => cell.trim()).filter(Boolean);
            if (cells.length !== 1) {
                failures.push(
                    invalidFailure(
                        rowIndex,
                        'Multi-cell rows must use the structured import flow.',
                    ),
                );
                continue;
            }
            tableCell = cells[0];
        }

        const raw =
            unit.kind === 'table-row'
                ? (tableCell ?? '')
                : unit.kind === 'list-item'
                  ? stripListMarker(unit.text)
                  : unit.text.trim();
        if (raw.length === 0) {
            failures.push(
                invalidFailure(rowIndex, 'The extracted term is empty.'),
            );
            continue;
        }
        if (hasDisallowedControlCharacter(raw)) {
            failures.push(
                invalidFailure(
                    rowIndex,
                    'The extracted term contains an unsupported control character.',
                ),
            );
            continue;
        }
        if (
            [...raw].length >
            documentIngestionLimitsV1.document.maximumUnitCodePoints
        ) {
            failures.push(
                invalidFailure(
                    rowIndex,
                    'The extracted term exceeds the 200 code point limit.',
                ),
            );
            continue;
        }
        rows.push({ input: raw, rowIndex });
    }

    return { failures, kind: 'review', rows };
}

export function validateDictionaryDocumentBlocks(
    blocks: readonly DictionaryDocumentBlock[],
): void {
    for (const block of blocks) DictionaryDocumentBlockSchema.parse(block);
    const serializedBytes = Buffer.byteLength(JSON.stringify(blocks), 'utf8');
    if (
        serializedBytes > documentIngestionLimitsV1.parser.maximumIpcOutputBytes
    )
        throw new InvalidDictionaryDocumentExtractionError('ipc_output_limit');

    const extractedTextBytes = blocks.reduce((total, block) => {
        if (block.kind === 'blank' || block.kind === 'heading') return total;
        if (block.kind === 'table-row')
            return (
                total +
                block.cells.reduce(
                    (cellTotal, cell) =>
                        cellTotal + Buffer.byteLength(cell, 'utf8'),
                    0,
                )
            );
        return total + Buffer.byteLength(block.text, 'utf8');
    }, 0);
    if (
        extractedTextBytes >
        documentIngestionLimitsV1.document.maximumExtractedUtf8Bytes
    )
        throw new InvalidDictionaryDocumentExtractionError(
            'extracted_text_limit',
        );
}

export type InvalidDictionaryDocumentExtractionReason =
    'extracted_text_limit' | 'ipc_output_limit' | 'invalid_adapter_output';

export class InvalidDictionaryDocumentExtractionError extends Error {
    public constructor(
        public readonly reason: InvalidDictionaryDocumentExtractionReason,
    ) {
        super(`Document extraction is invalid (${reason}).`);
        this.name = 'InvalidDictionaryDocumentExtractionError';
    }
}
