import {
    dictionaryInterchangeLimitsV1,
    dictionaryLanguonCsvFormatVersion,
    dictionaryLanguonCsvV1Headers,
    type DictionaryCard,
    type DictionaryExportFormat,
    type DictionaryImportDelimiter,
    type DictionaryImportOptions,
    type DictionaryImportRowFailure,
    type DictionaryImportRowWarning,
    type DictionaryLanguageTag,
    type DictionarySettingsValues,
} from '@languon/contracts';

import {
    dictionaryLimits,
    InvalidDictionaryTextError,
    normalizeDictionaryCardSourceForSearch,
    normalizeRequiredText,
} from './limits';

export type InvalidDictionaryInterchangeReason =
    | 'invalid_header'
    | 'invalid_utf8'
    | 'input_too_large'
    | 'output_too_large'
    | 'too_many_rows';

export class InvalidDictionaryInterchangeError extends Error {
    public constructor(
        public readonly reason: InvalidDictionaryInterchangeReason,
    ) {
        super(`Dictionary interchange failed (${reason}).`);
        this.name = 'InvalidDictionaryInterchangeError';
    }
}

export interface DictionaryInterchangePair {
    rowIndex: number;
    source: string;
    translation: string;
}

export interface DictionaryInterchangeParseResult {
    columns: Array<{
        heading: string | null;
        index: number;
        samples: string[];
    }>;
    failures: DictionaryImportRowFailure[];
    rows: DictionaryInterchangePair[];
    totalRows: number;
    warnings: DictionaryImportRowWarning[];
}

interface ParsedRecord {
    cells: string[];
    failureCode?: DictionaryImportRowFailure['code'];
}

const delimiterCharacter = (delimiter: DictionaryImportDelimiter) =>
    delimiter === 'comma' ? ',' : '\t';

function decodeImportBytes(bytes: Uint8Array): string {
    if (bytes.byteLength > dictionaryInterchangeLimitsV1.maximumInputUtf8Bytes)
        throw new InvalidDictionaryInterchangeError('input_too_large');
    try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (decoded.includes('\0'))
            throw new InvalidDictionaryInterchangeError('invalid_utf8');
        const withoutBom = decoded.startsWith('\uFEFF')
            ? decoded.slice(1)
            : decoded;
        if (
            [...withoutBom].some((character) => {
                const code = character.codePointAt(0)!;
                return (
                    ((code >= 0 && code <= 31) ||
                        (code >= 127 && code <= 159)) &&
                    code !== 9 &&
                    code !== 10 &&
                    code !== 13
                );
            })
        )
            throw new InvalidDictionaryInterchangeError('invalid_utf8');
        return withoutBom;
    } catch (error) {
        if (error instanceof InvalidDictionaryInterchangeError) throw error;
        throw new InvalidDictionaryInterchangeError('invalid_utf8');
    }
}

function parseDelimitedRecords(
    text: string,
    delimiter: DictionaryImportDelimiter,
): ParsedRecord[] {
    const separator = delimiterCharacter(delimiter);
    const records: ParsedRecord[] = [];
    let cells: string[] = [];
    let field = '';
    let fieldCodePoints = 0;
    let inQuotes = false;
    let quoteClosed = false;
    let rowFailure: ParsedRecord['failureCode'];
    let sawRowContent = false;

    const append = (value: string) => {
        const previousUnit = field.charCodeAt(field.length - 1);
        field += value;
        const currentUnit = value.length === 1 ? value.charCodeAt(0) : -1;
        fieldCodePoints +=
            currentUnit >= 0xdc00 &&
            currentUnit <= 0xdfff &&
            previousUnit >= 0xd800 &&
            previousUnit <= 0xdbff
                ? 0
                : [...value].length;
        if (
            !rowFailure &&
            fieldCodePoints >
                dictionaryInterchangeLimitsV1.maximumCellCodePoints
        )
            rowFailure = 'cell_too_long';
    };
    const finishField = () => {
        if (cells.length < dictionaryInterchangeLimitsV1.maximumColumns)
            cells.push(rowFailure === 'cell_too_long' ? '' : field);
        else rowFailure ??= 'too_many_columns';
        field = '';
        fieldCodePoints = 0;
        quoteClosed = false;
    };
    const finishRecord = () => {
        finishField();
        const structurallyBlank = cells.every(
            (cell) => cell.trim().length === 0,
        );
        if (rowFailure || !structurallyBlank) {
            records.push({
                cells,
                ...(rowFailure ? { failureCode: rowFailure } : {}),
            });
            if (records.length > dictionaryInterchangeLimitsV1.maximumRows + 1)
                throw new InvalidDictionaryInterchangeError('too_many_rows');
        }
        cells = [];
        rowFailure = undefined;
        sawRowContent = false;
    };

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index]!;
        if (inQuotes) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    append('"');
                    index += 1;
                } else {
                    inQuotes = false;
                    quoteClosed = true;
                }
            } else if (character === '\r' && text[index + 1] === '\n') {
                append('\r\n');
                index += 1;
            } else append(character);
            sawRowContent = true;
            continue;
        }

        const isNewline = character === '\r' || character === '\n';
        if (quoteClosed) {
            if (character === separator) finishField();
            else if (isNewline) {
                finishRecord();
                if (character === '\r' && text[index + 1] === '\n') index += 1;
            } else rowFailure ??= 'malformed_row';
            continue;
        }
        if (character === '"') {
            if (field.length === 0) inQuotes = true;
            else rowFailure ??= 'malformed_row';
            sawRowContent = true;
        } else if (character === separator) {
            finishField();
            sawRowContent = true;
        } else if (isNewline) {
            finishRecord();
            if (character === '\r' && text[index + 1] === '\n') index += 1;
        } else {
            append(character);
            sawRowContent = true;
        }
    }
    if (inQuotes) rowFailure ??= 'malformed_row';
    if (sawRowContent || field.length > 0 || cells.length > 0) finishRecord();
    return records;
}

function failure(
    rowIndex: number,
    code: DictionaryImportRowFailure['code'],
): DictionaryImportRowFailure {
    const messages: Record<DictionaryImportRowFailure['code'], string> = {
        cell_too_long: 'A cell exceeds the import preview limit.',
        invalid_source: 'The source term is invalid.',
        invalid_translation: 'The translation is invalid.',
        malformed_row: 'The row has invalid delimiter or quote syntax.',
        missing_column: 'The selected source or target column is missing.',
        too_many_columns: 'The row exceeds the column limit.',
    };
    return { code, message: messages[code], rowIndex };
}

export function parseDictionaryInterchange(input: {
    bytes: Uint8Array;
    options: DictionaryImportOptions;
}): DictionaryInterchangeParseResult {
    const records = parseDelimitedRecords(
        decodeImportBytes(input.bytes),
        input.options.delimiter,
    );
    if (
        records[0]?.cells[0] === 'record_type' &&
        records[0]?.cells[1] === 'languon_format_version'
    )
        throw new InvalidDictionaryInterchangeError('invalid_header');
    const header = input.options.hasHeader ? records.shift() : undefined;
    if (header?.failureCode)
        throw new InvalidDictionaryInterchangeError('invalid_header');
    if (records.length > dictionaryInterchangeLimitsV1.maximumRows)
        throw new InvalidDictionaryInterchangeError('too_many_rows');

    const rows: DictionaryInterchangePair[] = [];
    const failures: DictionaryImportRowFailure[] = [];
    const warnings: DictionaryImportRowWarning[] = [];
    const firstSourceRows = new Map<string, number>();
    const maximumColumns = Math.min(
        dictionaryInterchangeLimitsV1.maximumColumns,
        records.reduce(
            (maximum, row) => Math.max(maximum, row.cells.length),
            header?.cells.length ?? 0,
        ),
    );
    const columns = Array.from({ length: maximumColumns }, (_, index) => ({
        heading: header?.cells[index]?.slice(0, 500) ?? null,
        index,
        samples: records
            .map((record) => record.cells[index] ?? '')
            .filter((sample) => sample.length > 0)
            .slice(0, 3)
            .map((sample) => sample.slice(0, 500)),
    }));

    for (const [rowIndex, record] of records.entries()) {
        if (record.failureCode) {
            failures.push(failure(rowIndex, record.failureCode));
            continue;
        }
        const sourceInput = record.cells[input.options.sourceColumnIndex];
        const translationInput = record.cells[input.options.targetColumnIndex];
        if (sourceInput === undefined || translationInput === undefined) {
            failures.push(failure(rowIndex, 'missing_column'));
            continue;
        }
        let source: string;
        let translation: string;
        try {
            source = normalizeRequiredText(sourceInput, {
                field: 'source',
                maximumCodePoints: dictionaryLimits.requiredCardValueCodePoints,
            });
        } catch (error) {
            if (!(error instanceof InvalidDictionaryTextError)) throw error;
            failures.push(failure(rowIndex, 'invalid_source'));
            continue;
        }
        try {
            translation = normalizeRequiredText(translationInput, {
                field: 'translation',
                maximumCodePoints: dictionaryLimits.requiredCardValueCodePoints,
            });
        } catch (error) {
            if (!(error instanceof InvalidDictionaryTextError)) throw error;
            failures.push(failure(rowIndex, 'invalid_translation'));
            continue;
        }
        const sourceKey = normalizeDictionaryCardSourceForSearch(source);
        const duplicateRowIndex = firstSourceRows.get(sourceKey);
        if (duplicateRowIndex !== undefined)
            warnings.push({
                code: 'duplicate_source',
                duplicateCardId: null,
                duplicateRowIndex,
                message: 'This source duplicates an earlier import row.',
                rowIndex,
            });
        else firstSourceRows.set(sourceKey, rowIndex);
        rows.push({ rowIndex, source, translation });
    }
    return { columns, failures, rows, totalRows: records.length, warnings };
}

const unicodeLeadingWhitespace = /^\p{White_Space}*/u;

function formulaEscape(value: string, reversible: boolean) {
    const firstNonWhitespace = value.slice(
        unicodeLeadingWhitespace.exec(value)?.[0].length ?? 0,
    )[0];
    const escaped =
        (firstNonWhitespace !== undefined &&
            '=+-@'.includes(firstNonWhitespace)) ||
        (reversible && value.startsWith("'"));
    return { escaped, value: escaped ? `'${value}` : value };
}

function encodeRfc4180Cell(value: string, delimiter: ',' | '\t'): string {
    return value.includes('"') ||
        value.includes(delimiter) ||
        value.includes('\r') ||
        value.includes('\n')
        ? `"${value.replaceAll('"', '""')}"`
        : value;
}

export function decodeLanguonCsvEscapedCell(
    value: string,
    escaped: boolean,
): string {
    if (!escaped) return value;
    if (!value.startsWith("'"))
        throw new InvalidDictionaryInterchangeError('invalid_header');
    return value.slice(1);
}

export function decodeLanguonCsvNullableOverride(input: {
    formulaEscaped: boolean;
    inherited: boolean;
    value: string;
}): string | null {
    if (input.inherited) {
        if (input.value !== 'inherit' || input.formulaEscaped)
            throw new InvalidDictionaryInterchangeError('invalid_header');
        return null;
    }
    return decodeLanguonCsvEscapedCell(input.value, input.formulaEscaped);
}

export interface DictionaryInterchangeExportMetadata {
    dictionary: {
        description: string | null;
        name: string;
        settings: DictionarySettingsValues;
        sourceLanguage: DictionaryLanguageTag;
        targetLanguage: DictionaryLanguageTag;
    };
    format: DictionaryExportFormat;
}

export interface DictionaryInterchangeExportWarning {
    cardId: string;
    code: 'quizlet_text_normalized';
    fields: Array<'source' | 'translation'>;
}

function stringify(value: string | boolean | null): string {
    return value === null ? '' : String(value);
}

export interface DictionaryInterchangeSerializedPage {
    chunks: Uint8Array[];
    warnings: DictionaryInterchangeExportWarning[];
}

export interface DictionaryInterchangeSerializer {
    /** Serializes one keyset page. Returned chunks are page-bounded for backpressure. */
    serializeCards(
        cards: readonly DictionaryCard[],
    ): DictionaryInterchangeSerializedPage;
    /** Emits an otherwise-empty CSV header and permanently closes the serializer. */
    finish(): DictionaryInterchangeSerializedPage;
}

export function createDictionaryInterchangeSerializer(
    input: DictionaryInterchangeExportMetadata,
): DictionaryInterchangeSerializer {
    const encoder = new TextEncoder();
    let bytesWritten = 0;
    let cardsWritten = 0;
    let started = false;
    let finished = false;

    const encode = (value: string): Uint8Array => {
        const chunk = encoder.encode(value);
        bytesWritten += chunk.byteLength;
        if (bytesWritten > dictionaryInterchangeLimitsV1.maximumExportUtf8Bytes)
            throw new InvalidDictionaryInterchangeError('output_too_large');
        return chunk;
    };
    const header = (): Uint8Array[] => {
        if (started) return [];
        started = true;
        if (input.format === 'quizlet-text') return [];
        if (input.format === 'quizlet-csv')
            return [encode('source,translation\r\n')];
        const name = formulaEscape(input.dictionary.name, true);
        const description = formulaEscape(
            input.dictionary.description ?? '',
            true,
        );
        const customLabel = formulaEscape(
            input.dictionary.settings.transcriptionCustomLabel ?? '',
            true,
        );
        const metadata = new Map<string, string>([
            ['record_type', 'dictionary'],
            ['languon_format_version', dictionaryLanguonCsvFormatVersion],
            ['dictionary_name', name.value],
            ['dictionary_name_formula_escaped', stringify(name.escaped)],
            ['dictionary_description', description.value],
            [
                'dictionary_description_formula_escaped',
                stringify(description.escaped),
            ],
            ['source_language', input.dictionary.sourceLanguage],
            ['target_language', input.dictionary.targetLanguage],
            [
                'dictionary_transcription_enabled',
                stringify(input.dictionary.settings.transcriptionEnabled),
            ],
            [
                'dictionary_transcription_notation',
                input.dictionary.settings.transcriptionNotation,
            ],
            ['dictionary_transcription_custom_label', customLabel.value],
            [
                'dictionary_transcription_custom_label_formula_escaped',
                stringify(customLabel.escaped),
            ],
            [
                'dictionary_definition_enabled',
                stringify(input.dictionary.settings.definitionEnabled),
            ],
            [
                'dictionary_definition_language',
                input.dictionary.settings.definitionLanguage,
            ],
            [
                'dictionary_example_enabled',
                stringify(input.dictionary.settings.exampleEnabled),
            ],
            [
                'dictionary_example_language',
                input.dictionary.settings.exampleLanguage,
            ],
            [
                'dictionary_example_translation_enabled',
                stringify(input.dictionary.settings.exampleTranslationEnabled),
            ],
        ]);
        const row = dictionaryLanguonCsvV1Headers
            .map((column) => encodeRfc4180Cell(metadata.get(column) ?? '', ','))
            .join(',');
        return [
            encode(`${dictionaryLanguonCsvV1Headers.join(',')}\r\n`),
            encode(`${row}\r\n`),
        ];
    };
    const assertOpen = () => {
        if (finished)
            throw new Error('Dictionary interchange serializer is closed.');
    };

    return {
        serializeCards(cards) {
            assertOpen();
            if (
                cardsWritten + cards.length >
                dictionaryInterchangeLimitsV1.maximumRows
            )
                throw new InvalidDictionaryInterchangeError('too_many_rows');
            const chunks = header();
            const warnings: DictionaryInterchangeExportWarning[] = [];
            for (const card of cards) {
                if (input.format === 'quizlet-text') {
                    const fields: Array<'source' | 'translation'> = [];
                    const values = (['source', 'translation'] as const).map(
                        (field) => {
                            const raw = card.values[field];
                            const normalized = raw.replace(/[\t\r\n]+/gu, ' ');
                            if (normalized !== raw) fields.push(field);
                            return normalized;
                        },
                    );
                    if (fields.length > 0)
                        warnings.push({
                            cardId: card.id,
                            code: 'quizlet_text_normalized',
                            fields,
                        });
                    chunks.push(
                        encode(
                            `${cardsWritten === 0 ? '' : '\n'}${values.join('\t')}`,
                        ),
                    );
                    cardsWritten += 1;
                    continue;
                }
                if (input.format === 'quizlet-csv') {
                    chunks.push(
                        encode(
                            `${(['source', 'translation'] as const)
                                .map((field) =>
                                    encodeRfc4180Cell(
                                        formulaEscape(card.values[field], false)
                                            .value,
                                        ',',
                                    ),
                                )
                                .join(',')}\r\n`,
                        ),
                    );
                    cardsWritten += 1;
                    continue;
                }

                const escaped = (value: string | null) =>
                    formulaEscape(value ?? '', true);
                const source = escaped(card.values.source);
                const translation = escaped(card.values.translation);
                const transcription = escaped(card.values.transcription);
                const definition = escaped(card.values.definition);
                const example = escaped(card.values.example);
                const exampleTranslation = escaped(
                    card.values.exampleTranslation,
                );
                const overrideCustom = escaped(
                    card.overrides.transcriptionCustomLabel ?? 'inherit',
                );
                const effectiveCustom = escaped(
                    card.effectiveSettings.transcriptionCustomLabel,
                );
                const inherit = (value: string | boolean | null) =>
                    value === null ? 'inherit' : stringify(value);
                const values = new Map<string, string>([
                    ['record_type', 'card'],
                    [
                        'languon_format_version',
                        dictionaryLanguonCsvFormatVersion,
                    ],
                    ['position', String(cardsWritten + 1)],
                    ['source', source.value],
                    ['source_formula_escaped', stringify(source.escaped)],
                    ['translation', translation.value],
                    [
                        'translation_formula_escaped',
                        stringify(translation.escaped),
                    ],
                    ['transcription', transcription.value],
                    [
                        'transcription_formula_escaped',
                        stringify(transcription.escaped),
                    ],
                    ['definition', definition.value],
                    [
                        'definition_formula_escaped',
                        stringify(definition.escaped),
                    ],
                    ['example', example.value],
                    ['example_formula_escaped', stringify(example.escaped)],
                    ['example_translation', exampleTranslation.value],
                    [
                        'example_translation_formula_escaped',
                        stringify(exampleTranslation.escaped),
                    ],
                    [
                        'override_transcription_enabled',
                        inherit(card.overrides.transcriptionEnabled),
                    ],
                    [
                        'override_transcription_notation',
                        inherit(card.overrides.transcriptionNotation),
                    ],
                    [
                        'override_transcription_custom_label',
                        overrideCustom.value,
                    ],
                    [
                        'override_transcription_custom_label_formula_escaped',
                        stringify(overrideCustom.escaped),
                    ],
                    [
                        'override_transcription_custom_label_inherited',
                        stringify(
                            card.overrides.transcriptionCustomLabel === null,
                        ),
                    ],
                    [
                        'override_definition_enabled',
                        inherit(card.overrides.definitionEnabled),
                    ],
                    [
                        'override_definition_language',
                        inherit(card.overrides.definitionLanguage),
                    ],
                    [
                        'override_example_enabled',
                        inherit(card.overrides.exampleEnabled),
                    ],
                    [
                        'override_example_language',
                        inherit(card.overrides.exampleLanguage),
                    ],
                    [
                        'override_example_translation_enabled',
                        inherit(card.overrides.exampleTranslationEnabled),
                    ],
                    [
                        'effective_transcription_enabled',
                        stringify(card.effectiveSettings.transcriptionEnabled),
                    ],
                    [
                        'effective_transcription_notation',
                        card.effectiveSettings.transcriptionNotation,
                    ],
                    [
                        'effective_transcription_custom_label',
                        effectiveCustom.value,
                    ],
                    [
                        'effective_transcription_custom_label_formula_escaped',
                        stringify(effectiveCustom.escaped),
                    ],
                    [
                        'effective_definition_enabled',
                        stringify(card.effectiveSettings.definitionEnabled),
                    ],
                    [
                        'effective_definition_language',
                        card.effectiveSettings.definitionLanguage,
                    ],
                    [
                        'effective_example_enabled',
                        stringify(card.effectiveSettings.exampleEnabled),
                    ],
                    [
                        'effective_example_language',
                        card.effectiveSettings.exampleLanguage,
                    ],
                    [
                        'effective_example_translation_enabled',
                        stringify(
                            card.effectiveSettings.exampleTranslationEnabled,
                        ),
                    ],
                    [
                        'effective_example_translation_language',
                        card.effectiveSettings.exampleTranslationLanguage,
                    ],
                    ['authorship', card.authorship],
                ]);
                chunks.push(
                    encode(
                        `${dictionaryLanguonCsvV1Headers
                            .map((column) =>
                                encodeRfc4180Cell(
                                    values.get(column) ?? '',
                                    ',',
                                ),
                            )
                            .join(',')}\r\n`,
                    ),
                );
                cardsWritten += 1;
            }
            return { chunks, warnings };
        },
        finish() {
            assertOpen();
            finished = true;
            return { chunks: header(), warnings: [] };
        },
    };
}
