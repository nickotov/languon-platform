import { strToU8, zipSync } from 'fflate';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

import {
    hasPdfActiveContent,
    hasPdfPageActiveContent,
    InvalidNativeDocumentError,
    parseNativeDictionaryDocument,
    preflightPdfActiveContent,
} from '../../../../../../src/modules/dictionaries/infrastructure/document/native-document-parser';
import { classifyDictionaryDocumentTerms } from '../../../../../../src/modules/dictionaries/domain/document-ingestion';

const encoder = new TextEncoder();

describe('native dictionary document parser', () => {
    it('preserves explicit plain-text lines without semantic splitting', async () => {
        const extraction = await parseNativeDictionaryDocument({
            bytes: encoder.encode('bank\n\ncanvas'),
            mediaType: 'text/plain',
        });

        expect(extraction).toMatchObject({
            entries: [
                { block: { kind: 'line', text: 'bank' }, kind: 'block' },
                { block: { kind: 'blank' }, kind: 'block' },
                { block: { kind: 'line', text: 'canvas' }, kind: 'block' },
            ],
            pageCount: 1,
            totalPixels: 0,
        });
    });

    it('parses bounded Markdown paragraphs, lists, and single-cell tables', async () => {
        const extraction = await parseNativeDictionaryDocument({
            bytes: encoder.encode(
                '# Terms\n- bank\n  account noun\n1. canvas\n   fabric noun\nHarbors\n---\ncanvas has a\nparagraph continuation\n\n| Term |\n| --- |\n| harbor |',
            ),
            mediaType: 'text/markdown',
        });
        expect(
            extraction.entries.map((entry) =>
                entry.kind === 'block' ? entry.block : entry,
            ),
        ).toMatchObject([
            { kind: 'heading' },
            { kind: 'list-item', text: 'bank account noun' },
            { kind: 'list-item', text: 'canvas fabric noun' },
            { kind: 'heading' },
            {
                kind: 'paragraph',
                text: 'canvas has a paragraph continuation',
            },
            { kind: 'blank' },
            { kind: 'heading' },
            { cells: ['harbor'], kind: 'table-row' },
        ]);
    });

    it('keeps multi-cell Markdown rows as reviewable failures alongside valid terms', async () => {
        const extraction = await parseNativeDictionaryDocument({
            bytes: encoder.encode(
                'bank\n\n| Source | Translation |\n| --- | --- |\n| river bank | orilla |\n\n| Term |\n| --- |\n| harbor |',
            ),
            mediaType: 'text/markdown',
        });
        const result = classifyDictionaryDocumentTerms(
            extraction.entries.flatMap((entry) =>
                entry.kind === 'block' ? [entry.block] : [],
            ),
        );

        expect(result).toMatchObject({
            failures: [
                {
                    code: 'invalid_term',
                    input: '[Invalid extracted term]',
                    rowIndex: 1,
                },
            ],
            kind: 'review',
            rows: [
                { input: 'bank', rowIndex: 0 },
                { input: 'harbor', rowIndex: 2 },
            ],
        });
    });

    it('keeps all-invalid Markdown pair tables as failure-only review', async () => {
        const extraction = await parseNativeDictionaryDocument({
            bytes: encoder.encode(
                '| Source | Translation |\n| --- | --- |\n| bank | banco |\n| shore | orilla |',
            ),
            mediaType: 'text/markdown',
        });
        const result = classifyDictionaryDocumentTerms(
            extraction.entries.flatMap((entry) =>
                entry.kind === 'block' ? [entry.block] : [],
            ),
        );

        expect(result).toMatchObject({
            failures: [
                { code: 'invalid_term', rowIndex: 0 },
                { code: 'invalid_term', rowIndex: 1 },
            ],
            kind: 'review',
            rows: [],
        });
    });

    it('bounds pathological Markdown table cell counts', async () => {
        const header = Array.from({ length: 101 }, (_, index) => `h${index}`);
        const delimiter = header.map(() => '---');
        await expect(
            parseNativeDictionaryDocument({
                bytes: encoder.encode(
                    `| ${header.join(' | ')} |\n| ${delimiter.join(' | ')} |`,
                ),
                mediaType: 'text/markdown',
            }),
        ).rejects.toMatchObject({ reason: 'unsupported_structure' });
    });

    it('rejects active Markdown blocks', async () => {
        await expect(
            parseNativeDictionaryDocument({
                bytes: encoder.encode('<script>alert(1)</script>'),
                mediaType: 'text/markdown',
            }),
        ).rejects.toMatchObject({ reason: 'active_content' });
    });

    it('detects PDF document active-content maps and null pdfjs results', () => {
        expect(
            hasPdfActiveContent({
                attachments: null,
                documentActions: null,
                openAction: null,
            }),
        ).toBe(false);
        expect(
            hasPdfActiveContent({
                attachments: new Map(),
                documentActions: {},
                openAction: new Map(),
            }),
        ).toBe(false);
        expect(
            hasPdfActiveContent({
                attachments: new Map([['attachment', { filename: 'payload' }]]),
                documentActions: null,
                openAction: null,
            }),
        ).toBe(true);
        expect(
            hasPdfActiveContent({
                attachments: null,
                documentActions: null,
                openAction: new Map([['action', 'Launch']]),
            }),
        ).toBe(true);
    });

    it('rejects page JavaScript and active launch/open annotations conservatively', () => {
        const activeAnnotationTypes = new Set([16, 17]);
        expect(
            hasPdfPageActiveContent({
                activeAnnotationTypes,
                annotations: [{ dest: ['internal-page'] }],
                pageActions: {},
            }),
        ).toBe(false);
        for (const input of [
            { annotations: [], pageActions: { PageOpen: ['javascript'] } },
            { annotations: [{ unsafeUrl: 'payload.exe' }], pageActions: {} },
            {
                annotations: [{ actions: { MouseUp: ['javascript'] } }],
                pageActions: {},
            },
            { annotations: [{ annotationType: 16 }], pageActions: {} },
        ])
            expect(
                hasPdfPageActiveContent({ activeAnnotationTypes, ...input }),
            ).toBe(true);
    });

    it('preflights every PDF page before extraction or rendering', async () => {
        const getTextContent = vi.fn();
        const page = {
            getAnnotations: vi.fn(async () => [{ unsafeUrl: 'payload.exe' }]),
            getJSActions: vi.fn(async () => ({})),
            getTextContent,
        };
        const getPage = vi.fn(async () => page);

        await expect(
            preflightPdfActiveContent(
                {
                    getAttachments: vi.fn(async () => null),
                    getJSActions: vi.fn(async () => null),
                    getOpenAction: vi.fn(
                        async () => new Map([['action', 'Launch']]),
                    ),
                    getPage,
                    numPages: 1,
                },
                new Set(),
            ),
        ).rejects.toMatchObject({ reason: 'active_content' });
        expect(getPage).not.toHaveBeenCalled();

        await expect(
            preflightPdfActiveContent(
                {
                    getAttachments: vi.fn(async () => null),
                    getJSActions: vi.fn(async () => null),
                    getOpenAction: vi.fn(async () => null),
                    getPage,
                    numPages: 1,
                },
                new Set(),
            ),
        ).rejects.toMatchObject({ reason: 'active_content' });
        expect(getPage).toHaveBeenCalledWith(1);
        expect(getTextContent).not.toHaveBeenCalled();
    });

    it('extracts ordered DOCX paragraphs, lists and table cells', async () => {
        const documentXml = `<?xml version="1.0"?><w:document xmlns:w="urn:w"><w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Terms</w:t></w:r></w:p>
            <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>bank</w:t></w:r></w:p>
            <w:p><w:r><w:t>canvas</w:t></w:r></w:p>
            <w:tbl><w:tr><w:tc><w:p><w:r><w:t>harbor</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
        </w:body></w:document>`;
        const bytes = zipSync({
            '[Content_Types].xml': strToU8(
                '<?xml version="1.0"?><Types xmlns="urn:types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
            ),
            'word/document.xml': strToU8(documentXml),
        });

        const extraction = await parseNativeDictionaryDocument({
            bytes,
            mediaType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        expect(
            extraction.entries.map((entry) =>
                entry.kind === 'block' ? entry.block : entry,
            ),
        ).toMatchObject([
            { kind: 'heading' },
            { kind: 'list-item', text: 'bank' },
            { kind: 'paragraph', text: 'canvas' },
            { cells: ['harbor'], kind: 'table-row' },
        ]);
    });

    it('normalizes a bounded image into an OCR page and rejects format mismatch', async () => {
        const bytes = await sharp({
            create: {
                background: '#ffffff',
                channels: 3,
                height: 4,
                width: 8,
            },
        })
            .png()
            .toBuffer();
        const extraction = await parseNativeDictionaryDocument({
            bytes,
            mediaType: 'image/png',
        });
        expect(extraction).toMatchObject({
            entries: [
                {
                    kind: 'ocr-page',
                    page: { heightPixels: 4, pageNumber: 1, widthPixels: 8 },
                },
            ],
            totalPixels: 32,
        });
        await expect(
            parseNativeDictionaryDocument({
                bytes,
                mediaType: 'image/jpeg',
            }),
        ).rejects.toBeInstanceOf(InvalidNativeDocumentError);
    });

    it('rejects invalid UTF-8 text', async () => {
        await expect(
            parseNativeDictionaryDocument({
                bytes: Uint8Array.from([0xc3, 0x28]),
                mediaType: 'text/plain',
            }),
        ).rejects.toMatchObject({ reason: 'invalid_text' });
    });
});
