import type { DictionaryCard } from '@languon/contracts';
import { describe, expect, it } from 'vitest';

import {
    createDictionaryInterchangeSerializer,
    decodeLanguonCsvEscapedCell,
    decodeLanguonCsvNullableOverride,
    InvalidDictionaryInterchangeError,
    parseDictionaryInterchange,
} from '../../../../../src/modules/dictionaries/domain/interchange';

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (chunks: Uint8Array[]) =>
    chunks.map((chunk) => new TextDecoder().decode(chunk)).join('');
const options = {
    delimiter: 'comma' as const,
    hasHeader: true,
    sourceColumnIndex: 0,
    targetColumnIndex: 1,
};

function card(values: Partial<DictionaryCard['values']> = {}): DictionaryCard {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        dictionaryId: '22222222-2222-4222-8222-222222222222',
        authorship: 'human',
        lifecycle: 'active',
        position: 'a',
        version: 1,
        settingsVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        values: {
            source: 'bank',
            translation: 'banco',
            transcription: null,
            definition: null,
            example: null,
            exampleTranslation: null,
            ...values,
        },
        overrides: {
            transcriptionEnabled: null,
            transcriptionNotation: null,
            transcriptionCustomLabel: null,
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
        },
        effectiveSettings: {
            transcriptionEnabled: true,
            transcriptionNotation: 'ipa',
            transcriptionCustomLabel: null,
            definitionEnabled: true,
            definitionLanguage: 'target',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target',
        },
    };
}

const metadata = {
    dictionary: {
        name: "'=Dictionary",
        description: '+description',
        sourceLanguage: 'en' as const,
        targetLanguage: 'es' as const,
        settings: {
            transcriptionEnabled: true,
            transcriptionNotation: 'ipa' as const,
            transcriptionCustomLabel: null,
            definitionEnabled: true,
            definitionLanguage: 'target' as const,
            exampleEnabled: true,
            exampleLanguage: 'source' as const,
            exampleTranslationEnabled: true,
        },
    },
};

describe('dictionary interchange domain', () => {
    it('parses BOM, CRLF, quoted separators and embedded line breaks', () => {
        const result = parseDictionaryInterchange({
            bytes: encode(
                '\uFEFFsource,translation\r\n"bank, account","banco"\r\n"line\r\nbreak",salto',
            ),
            options,
        });
        expect(result.rows).toEqual([
            { rowIndex: 0, source: 'bank, account', translation: 'banco' },
            { rowIndex: 1, source: 'line\r\nbreak', translation: 'salto' },
        ]);
    });

    it('ignores blank records and reports malformed rows without losing later rows', () => {
        const result = parseDictionaryInterchange({
            bytes: encode('source,translation\n\n"bad"x,value\nriver,río'),
            options,
        });
        expect(result.failures).toEqual([
            expect.objectContaining({ code: 'malformed_row', rowIndex: 0 }),
        ]);
        expect(result.rows).toEqual([
            { rowIndex: 1, source: 'river', translation: 'río' },
        ]);
    });

    it('applies the 10k cap after ignoring leading, interspersed, and trailing blanks', () => {
        const dataRows = Array.from(
            { length: 10_000 },
            (_, index) => `s${index},t${index}`,
        );
        const interspersed = dataRows.flatMap((row, index) =>
            index % 1_000 === 0 ? ['', '   ', row] : [row],
        );
        const withHeader = parseDictionaryInterchange({
            bytes: encode(
                [' ', '', 'source,translation', ...interspersed, '', '\t'].join(
                    '\n',
                ),
            ),
            options,
        });
        expect(withHeader.totalRows).toBe(10_000);
        expect(withHeader.rows).toHaveLength(10_000);
        expect(withHeader.rows.at(-1)?.rowIndex).toBe(9_999);

        const withoutHeader = parseDictionaryInterchange({
            bytes: encode(['', ...interspersed, '', ' '].join('\n')),
            options: { ...options, hasHeader: false },
        });
        expect(withoutHeader.rows).toHaveLength(10_000);
        expect(() =>
            parseDictionaryInterchange({
                bytes: encode([...dataRows, 'overflow,value'].join('\n')),
                options: { ...options, hasHeader: false },
            }),
        ).toThrow(
            expect.objectContaining<Partial<InvalidDictionaryInterchangeError>>(
                {
                    reason: 'too_many_rows',
                },
            ),
        );
    });

    it('retains blank-valued lexical failures while ignoring safe blank records', () => {
        const result = parseDictionaryInterchange({
            bytes: encode(
                [
                    'source,translation',
                    '',
                    'valid,válido',
                    `${' '.repeat(8_193)},`,
                    ','.repeat(101),
                    '   ',
                    '"',
                ].join('\n'),
            ),
            options,
        });
        expect(result.rows).toEqual([
            { rowIndex: 0, source: 'valid', translation: 'válido' },
        ]);
        expect(
            result.failures.map(({ code, rowIndex }) => ({ code, rowIndex })),
        ).toEqual([
            { code: 'cell_too_long', rowIndex: 1 },
            { code: 'too_many_columns', rowIndex: 2 },
            { code: 'malformed_row', rowIndex: 3 },
        ]);
        expect(result.totalRows).toBe(4);
    });

    it('rejects invalid UTF-8, controls, and the versioned full-export grammar', () => {
        for (const bytes of [
            new Uint8Array([0xc3, 0x28]),
            encode('source,translation\na\u0085b,c'),
            encode(
                'record_type,languon_format_version\ndictionary,languon-csv:v1',
            ),
        ])
            expect(() =>
                parseDictionaryInterchange({ bytes, options }),
            ).toThrow(InvalidDictionaryInterchangeError);
    });

    it('emits duplicate warnings while retaining every valid row', () => {
        const result = parseDictionaryInterchange({
            bytes: encode('source,translation\nＢＡＮＫ,uno\nbank,dos'),
            options,
        });
        expect(result.rows).toHaveLength(2);
        expect(result.warnings).toEqual([
            expect.objectContaining({
                duplicateCardId: null,
                duplicateRowIndex: 0,
                rowIndex: 1,
            }),
        ]);
    });

    it('counts astral terms by Unicode code point', () => {
        const source = '😀'.repeat(200);
        expect(
            parseDictionaryInterchange({
                bytes: encode(`source,translation\n${source},emoji`),
                options,
            }).rows[0]?.source,
        ).toBe(source);
    });

    it('streams Quizlet text pages and reports normalized core fields', () => {
        const serializer = createDictionaryInterchangeSerializer({
            ...metadata,
            format: 'quizlet-text',
        });
        const first = serializer.serializeCards([
            card({ source: 'one\t\r\ntwo', translation: 'uno\n\tdos' }),
        ]);
        const second = serializer.serializeCards([card({ source: 'river' })]);
        expect(decode([...first.chunks, ...second.chunks])).toBe(
            'one two\tuno dos\nriver\tbanco',
        );
        expect(first.warnings[0]?.fields).toEqual(['source', 'translation']);
    });

    it('neutralizes CSV formula cells before RFC4180 quoting', () => {
        const serializer = createDictionaryInterchangeSerializer({
            ...metadata,
            format: 'quizlet-csv',
        });
        const page = serializer.serializeCards([
            card({ source: '\t=1+1', translation: '+SUM(1,2)' }),
        ]);
        expect(decode(page.chunks)).toBe(
            'source,translation\r\n\'\t=1+1,"\'+SUM(1,2)"\r\n',
        );
    });

    it('round-trips seeded RFC4180 pairs across delimiter and Unicode cases', () => {
        let state = 0x5eed1234;
        const alphabet = ['a', 'b', ',', '"', '\n', 'é', '😀'];
        const nextText = () => {
            let value = 'x';
            for (let index = 0; index < 12; index += 1) {
                state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
                value += alphabet[state % alphabet.length];
            }
            return `${value}x`;
        };
        for (let iteration = 0; iteration < 64; iteration += 1) {
            const source = nextText();
            const translation = nextText();
            const serializer = createDictionaryInterchangeSerializer({
                ...metadata,
                format: 'quizlet-csv',
            });
            const content = decode(
                serializer.serializeCards([card({ source, translation })])
                    .chunks,
            );
            expect(
                parseDictionaryInterchange({ bytes: encode(content), options })
                    .rows,
            ).toEqual([{ rowIndex: 0, source, translation }]);
        }
    });

    it('always streams one reversible metadata record before full card rows', () => {
        const empty = createDictionaryInterchangeSerializer({
            ...metadata,
            format: 'languon-csv:v1',
        }).finish();
        const emptyText = decode(empty.chunks);
        expect(emptyText.split('\r\n')).toHaveLength(3);
        expect(emptyText).toContain('record_type,languon_format_version');
        expect(emptyText).toContain(
            "dictionary,languon-csv:v1,''=Dictionary,true,'+description,true",
        );

        const serializer = createDictionaryInterchangeSerializer({
            ...metadata,
            format: 'languon-csv:v1',
        });
        const text = decode(
            serializer.serializeCards([card({ source: "'term" })]).chunks,
        );
        expect(text).toContain('\r\ncard,languon-csv:v1');
        expect(text).toContain('inherit');
        expect(decodeLanguonCsvEscapedCell("''term", true)).toBe("'term");
    });

    it('distinguishes an inherited custom-label override from literal inherit', () => {
        const serialize = (value: string | null) => {
            const base = card();
            const serializer = createDictionaryInterchangeSerializer({
                ...metadata,
                format: 'languon-csv:v1',
            });
            const lines = decode(
                serializer.serializeCards([
                    {
                        ...base,
                        overrides: {
                            ...base.overrides,
                            transcriptionCustomLabel: value,
                        },
                    },
                ]).chunks,
            ).split('\r\n');
            const headers = lines[0]!.split(',');
            const cells = lines[2]!.split(',');
            const read = (name: string) => cells[headers.indexOf(name)]!;
            return decodeLanguonCsvNullableOverride({
                formulaEscaped:
                    read(
                        'override_transcription_custom_label_formula_escaped',
                    ) === 'true',
                inherited:
                    read('override_transcription_custom_label_inherited') ===
                    'true',
                value: read('override_transcription_custom_label'),
            });
        };
        expect(serialize(null)).toBeNull();
        expect(serialize('inherit')).toBe('inherit');
        expect(() =>
            decodeLanguonCsvNullableOverride({
                formulaEscaped: false,
                inherited: true,
                value: 'not-the-null-tag',
            }),
        ).toThrow(InvalidDictionaryInterchangeError);
    });
});
