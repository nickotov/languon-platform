import { createCanvas } from '@napi-rs/canvas';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

import type { DictionaryDocumentExtraction } from '../../application/ports/sandboxed-document-extractor';
import {
    documentIngestionLimitsV1,
    type DictionaryDocumentBlock,
    type DictionaryDocumentMediaType,
} from '../../domain/document-ingestion';

export type InvalidNativeDocumentReason =
    | 'active_content'
    | 'archive_limit'
    | 'invalid_format'
    | 'invalid_text'
    | 'page_limit'
    | 'pixel_limit'
    | 'unsupported_structure';

export class InvalidNativeDocumentError extends Error {
    public constructor(public readonly reason: InvalidNativeDocumentReason) {
        super(`Native document extraction failed (${reason}).`);
        this.name = 'InvalidNativeDocumentError';
    }
}

interface XmlNode {
    [key: string]: unknown;
}

function location(blockIndex: number, pageNumber = 1) {
    return { blockIndex, pageNumber };
}

function strictText(bytes: Uint8Array): string {
    try {
        const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (value.includes('\0')) throw new Error('NUL');
        return value;
    } catch {
        throw new InvalidNativeDocumentError('invalid_text');
    }
}

function textLines(text: string): DictionaryDocumentBlock[] {
    return text
        .split(/\r\n|\n|\r/u)
        .map((line, blockIndex) =>
            line.trim().length === 0
                ? { kind: 'blank', location: location(blockIndex) }
                : { kind: 'line', location: location(blockIndex), text: line },
        );
}

const maximumMarkdownAstNodes = 4_096;
const maximumMarkdownTableCells =
    documentIngestionLimitsV1.document.maximumExtractedUnits;

interface MarkdownAstNode {
    kind: 'blank' | 'heading' | 'list-item' | 'paragraph' | 'table-row';
    lines?: string[];
    cells?: string[];
}

function markdownTableCells(line: string): string[] | null {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return null;
    const inner = trimmed.replace(/^\|/u, '').replace(/\|$/u, '');
    const cells: string[] = [];
    let cell = '';
    let escaped = false;
    for (const character of inner) {
        if (escaped) {
            cell += character;
            escaped = false;
        } else if (character === '\\') {
            escaped = true;
        } else if (character === '|') {
            cells.push(cell.trim());
            if (cells.length > maximumMarkdownTableCells)
                throw new InvalidNativeDocumentError('unsupported_structure');
            cell = '';
        } else {
            cell += character;
        }
    }
    if (escaped) cell += '\\';
    cells.push(cell.trim());
    if (cells.length > maximumMarkdownTableCells)
        throw new InvalidNativeDocumentError('unsupported_structure');
    return cells;
}

function isMarkdownTableDelimiter(cells: string[]): boolean {
    return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell));
}

function parseMarkdownAst(text: string): MarkdownAstNode[] {
    const lines = text.split(/\r\n|\n|\r/u);
    if (
        lines.some(
            (line) =>
                /^\s*```/u.test(line) ||
                /^\s*~~~/u.test(line) ||
                /^\s*>/u.test(line) ||
                /<\/?[A-Za-z!][^>]*>/u.test(line),
        )
    )
        throw new InvalidNativeDocumentError('active_content');
    const nodes: MarkdownAstNode[] = [];
    const push = (node: MarkdownAstNode) => {
        nodes.push(node);
        if (nodes.length > maximumMarkdownAstNodes)
            throw new InvalidNativeDocumentError('unsupported_structure');
    };
    for (let index = 0; index < lines.length;) {
        const line = lines[index]!;
        if (line.trim().length === 0) {
            push({ kind: 'blank' });
            index += 1;
            continue;
        }
        if (/^\s{0,3}#{1,6}(?:\s+|$)/u.test(line)) {
            push({ kind: 'heading' });
            index += 1;
            continue;
        }
        if (/^\s*(?:[-+*]|\d{1,9}[.)])\s+/u.test(line)) {
            const itemLines = [
                line.replace(/^\s*(?:[-+*]|\d{1,9}[.)])\s+/u, '').trim(),
            ];
            index += 1;
            while (
                index < lines.length &&
                /^(?: {2,}|\t)\S/u.test(lines[index]!) &&
                !/^\s*(?:[-+*]|\d{1,9}[.)])\s+/u.test(lines[index]!)
            ) {
                itemLines.push(lines[index]!.trim());
                index += 1;
            }
            push({ kind: 'list-item', lines: itemLines });
            continue;
        }
        if (
            index + 1 < lines.length &&
            /^\s*(?:=+|-+)\s*$/u.test(lines[index + 1]!)
        ) {
            push({ kind: 'heading' });
            index += 2;
            continue;
        }
        const headerCells = markdownTableCells(line);
        const delimiterCells =
            index + 1 < lines.length
                ? markdownTableCells(lines[index + 1]!)
                : null;
        if (
            headerCells &&
            delimiterCells &&
            isMarkdownTableDelimiter(delimiterCells)
        ) {
            if (headerCells.length !== delimiterCells.length)
                throw new InvalidNativeDocumentError('unsupported_structure');
            push({ kind: 'heading' });
            index += 2;
            while (index < lines.length) {
                const cells = markdownTableCells(lines[index]!);
                if (!cells) break;
                push({ cells, kind: 'table-row' });
                index += 1;
            }
            continue;
        }
        const paragraphLines = [line.trim()];
        index += 1;
        while (index < lines.length) {
            const continuation = lines[index]!;
            if (
                continuation.trim().length === 0 ||
                /^\s{0,3}#{1,6}(?:\s+|$)/u.test(continuation) ||
                /^\s*(?:[-+*]|\d{1,9}[.)])\s+/u.test(continuation)
            )
                break;
            const nextCells = markdownTableCells(continuation);
            const afterCells =
                index + 1 < lines.length
                    ? markdownTableCells(lines[index + 1]!)
                    : null;
            if (nextCells && afterCells && isMarkdownTableDelimiter(afterCells))
                break;
            paragraphLines.push(continuation.trim());
            index += 1;
        }
        push({ kind: 'paragraph', lines: paragraphLines });
    }
    return nodes;
}

function markdownBlocks(text: string): DictionaryDocumentBlock[] {
    return parseMarkdownAst(text).map((node, blockIndex) => {
        if (node.kind === 'blank' || node.kind === 'heading')
            return { kind: node.kind, location: location(blockIndex) };
        if (node.kind === 'table-row')
            return {
                cells: node.cells ?? [],
                kind: 'table-row' as const,
                location: location(blockIndex),
            };
        return {
            kind: node.kind,
            location: location(blockIndex),
            text: (node.lines ?? []).join(' '),
        };
    });
}

function validateZipDirectory(bytes: Uint8Array): void {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let entries = 0;
    let expandedBytes = 0;
    const names = new Set<string>();
    for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) continue;
        const flags = view.getUint16(offset + 8, true);
        const compression = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const expandedSize = view.getUint32(offset + 24, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const externalAttributes = view.getUint32(offset + 38, true);
        const end = offset + 46 + nameLength + extraLength + commentLength;
        if (end > bytes.byteLength)
            throw new InvalidNativeDocumentError('invalid_format');
        const name = strictText(
            bytes.subarray(offset + 46, offset + 46 + nameLength),
        );
        entries += 1;
        expandedBytes += expandedSize;
        const unixMode = externalAttributes >>> 16;
        if (
            entries > documentIngestionLimitsV1.zip.maximumEntries ||
            expandedBytes >
                documentIngestionLimitsV1.zip.maximumExpandedBytes ||
            flags & 1 ||
            ![0, 8].includes(compression) ||
            (compressedSize === 0
                ? expandedSize > 0
                : expandedSize / compressedSize >
                  documentIngestionLimitsV1.zip.maximumExpansionRatio) ||
            name.length === 0 ||
            name.startsWith('/') ||
            name.includes('\\') ||
            name.split('/').some((segment) => segment === '..') ||
            names.has(name) ||
            (unixMode & 0o170000) === 0o120000 ||
            /\.(?:7z|gz|rar|tar|zip)$/iu.test(name)
        )
            throw new InvalidNativeDocumentError('archive_limit');
        names.add(name);
        offset = end - 1;
    }
    if (entries === 0) throw new InvalidNativeDocumentError('invalid_format');
}

function isNode(value: unknown): value is XmlNode {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function children(value: unknown, key: string): unknown[][] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        if (!isNode(entry)) return [];
        const child = entry[key];
        return Array.isArray(child) ? [child] : [];
    });
}

function hasKey(value: unknown, key: string): boolean {
    if (Array.isArray(value)) return value.some((entry) => hasKey(entry, key));
    if (!isNode(value)) return false;
    return (
        key in value || Object.values(value).some((entry) => hasKey(entry, key))
    );
}

function xmlText(value: unknown): string {
    const values: string[] = [];
    const visit = (entry: unknown) => {
        if (Array.isArray(entry)) {
            for (const child of entry) visit(child);
            return;
        }
        if (!isNode(entry)) return;
        if (typeof entry['#text'] === 'string') values.push(entry['#text']);
        if ('w:tab' in entry || 'w:br' in entry || 'w:cr' in entry)
            values.push(' ');
        for (const [key, child] of Object.entries(entry))
            if (key !== '#text' && key !== ':@') visit(child);
    };
    visit(value);
    return values.join('').replace(/\s+/gu, ' ').trim();
}

function paragraphKind(value: unknown): 'heading' | 'list-item' | 'paragraph' {
    if (hasKey(value, 'w:numPr')) return 'list-item';
    const serialized = JSON.stringify(value);
    return /@_w:val":"Heading(?:[1-9]|Title)/u.test(serialized)
        ? 'heading'
        : 'paragraph';
}

function parseDocx(bytes: Uint8Array): DictionaryDocumentBlock[] {
    validateZipDirectory(bytes);
    let archive: Record<string, Uint8Array>;
    try {
        archive = unzipSync(bytes);
    } catch {
        throw new InvalidNativeDocumentError('invalid_format');
    }
    const names = Object.keys(archive);
    if (
        names.some((name) =>
            /(?:^|\/)(?:vbaProject\.bin|activeX|embeddings)(?:\/|$)/iu.test(
                name,
            ),
        )
    )
        throw new InvalidNativeDocumentError('active_content');
    const required = archive['word/document.xml'];
    const contentTypes = archive['[Content_Types].xml'];
    if (!required || !contentTypes)
        throw new InvalidNativeDocumentError('invalid_format');
    const xmlDocuments = names
        .filter((name) => name.endsWith('.xml') || name.endsWith('.rels'))
        .map((name) => strictText(archive[name]!));
    if (
        xmlDocuments.some(
            (xml) =>
                /<!DOCTYPE|<!ENTITY/iu.test(xml) ||
                /TargetMode\s*=\s*["']External["']/iu.test(xml) ||
                /macroEnabled|vbaProject|ActiveX|oleObject/iu.test(xml),
        )
    )
        throw new InvalidNativeDocumentError('active_content');

    let parsed: unknown;
    try {
        parsed = new XMLParser({
            ignoreAttributes: false,
            preserveOrder: true,
            processEntities: false,
        }).parse(strictText(required));
    } catch {
        throw new InvalidNativeDocumentError('invalid_format');
    }
    const document = children(parsed, 'w:document')[0];
    const body = children(document, 'w:body')[0];
    if (!body) throw new InvalidNativeDocumentError('invalid_format');
    const blocks: DictionaryDocumentBlock[] = [];
    for (const entry of body) {
        if (!isNode(entry)) continue;
        if (Array.isArray(entry['w:p'])) {
            const text = xmlText(entry['w:p']);
            const kind =
                text.length === 0 ? 'blank' : paragraphKind(entry['w:p']);
            blocks.push({
                kind,
                location: location(blocks.length),
                ...(kind === 'blank' || kind === 'heading' ? {} : { text }),
            } as DictionaryDocumentBlock);
            continue;
        }
        if (Array.isArray(entry['w:tbl'])) {
            for (const row of children(entry['w:tbl'], 'w:tr')) {
                const cells = children(row, 'w:tc').map(xmlText);
                blocks.push({
                    cells,
                    kind: 'table-row',
                    location: location(blocks.length),
                });
            }
        }
    }
    return blocks;
}

async function parseImage(
    bytes: Uint8Array,
    mediaType: DictionaryDocumentMediaType,
): Promise<DictionaryDocumentExtraction> {
    let metadata;
    try {
        metadata = await sharp(bytes, {
            limitInputPixels:
                documentIngestionLimitsV1.document.maximumPagePixels,
            sequentialRead: true,
        }).metadata();
    } catch {
        throw new InvalidNativeDocumentError('invalid_format');
    }
    const expected = (
        {
            'image/jpeg': 'jpeg',
            'image/png': 'png',
            'image/webp': 'webp',
        } as Partial<Record<DictionaryDocumentMediaType, string>>
    )[mediaType];
    if (
        metadata.format !== expected ||
        !metadata.width ||
        !metadata.height ||
        metadata.width >
            documentIngestionLimitsV1.document.maximumImageDimensionPixels ||
        metadata.height >
            documentIngestionLimitsV1.document.maximumImageDimensionPixels ||
        metadata.width * metadata.height >
            documentIngestionLimitsV1.document.maximumPagePixels
    )
        throw new InvalidNativeDocumentError('pixel_limit');
    const content = await sharp(bytes, { sequentialRead: true })
        .png()
        .toBuffer();
    if (
        content.byteLength > documentIngestionLimitsV1.ocr.maximumPageInputBytes
    )
        throw new InvalidNativeDocumentError('pixel_limit');
    return {
        entries: [
            {
                kind: 'ocr-page',
                page: {
                    content,
                    heightPixels: metadata.height,
                    pageNumber: 1,
                    widthPixels: metadata.width,
                },
            },
        ],
        pageCount: 1,
        totalPixels: metadata.width * metadata.height,
    };
}

function hasContainerEntries(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (value instanceof Map || value instanceof Set) return value.size > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

export function hasPdfActiveContent(input: {
    attachments: unknown;
    documentActions: unknown;
    openAction: unknown;
}): boolean {
    return (
        hasContainerEntries(input.attachments) ||
        hasContainerEntries(input.documentActions) ||
        hasContainerEntries(input.openAction)
    );
}

const pdfActiveAnnotationKeys = [
    'action',
    'actions',
    'attachment',
    'attachmentId',
    'file',
    'hasJSActions',
    'newWindow',
    'resetForm',
    'setOCGState',
    'unsafeUrl',
    'url',
] as const;
const maximumPdfAnnotationsPerPage = 1_000;

export function hasPdfPageActiveContent(input: {
    activeAnnotationTypes: ReadonlySet<number>;
    annotations: unknown;
    pageActions: unknown;
}): boolean {
    if (hasContainerEntries(input.pageActions)) return true;
    if (!Array.isArray(input.annotations)) return true;
    if (input.annotations.length > maximumPdfAnnotationsPerPage) return true;
    return input.annotations.some((annotation) => {
        if (!isNode(annotation)) return true;
        if (
            typeof annotation.annotationType === 'number' &&
            input.activeAnnotationTypes.has(annotation.annotationType)
        )
            return true;
        return pdfActiveAnnotationKeys.some((key) => {
            const value = annotation[key];
            return typeof value === 'boolean'
                ? value
                : hasContainerEntries(value);
        });
    });
}

interface PdfPageSafetyProbe {
    getAnnotations(input: { intent: 'display' }): Promise<unknown>;
    getJSActions(): Promise<unknown>;
}

interface PdfDocumentSafetyProbe<TPage extends PdfPageSafetyProbe> {
    getAttachments(): Promise<unknown>;
    getJSActions(): Promise<unknown>;
    getOpenAction(): Promise<unknown>;
    getPage(pageNumber: number): Promise<TPage>;
    numPages: number;
}

export async function preflightPdfActiveContent<
    TPage extends PdfPageSafetyProbe,
>(
    document: PdfDocumentSafetyProbe<TPage>,
    activeAnnotationTypes: ReadonlySet<number>,
): Promise<TPage[]> {
    const [attachments, documentActions, openAction] = await Promise.all([
        document.getAttachments(),
        document.getJSActions(),
        document.getOpenAction(),
    ]);
    if (hasPdfActiveContent({ attachments, documentActions, openAction }))
        throw new InvalidNativeDocumentError('active_content');

    const pages: TPage[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const [pageActions, annotations] = await Promise.all([
            page.getJSActions(),
            page.getAnnotations({ intent: 'display' }),
        ]);
        if (
            hasPdfPageActiveContent({
                activeAnnotationTypes,
                annotations,
                pageActions,
            })
        )
            throw new InvalidNativeDocumentError('active_content');
        pages.push(page);
    }
    return pages;
}

async function parsePdf(
    bytes: Uint8Array,
): Promise<DictionaryDocumentExtraction> {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    let loadingTask;
    let document;
    try {
        loadingTask = pdfjs.getDocument({
            data: bytes,
            disableFontFace: true,
            disableRange: true,
            disableStream: true,
            useSystemFonts: false,
        });
        document = await loadingTask.promise;
    } catch {
        throw new InvalidNativeDocumentError('invalid_format');
    }
    try {
        if (document.numPages > documentIngestionLimitsV1.document.maximumPages)
            throw new InvalidNativeDocumentError('page_limit');
        const pages = await preflightPdfActiveContent(
            document,
            new Set([
                pdfjs.AnnotationType.FILEATTACHMENT,
                pdfjs.AnnotationType.MOVIE,
                pdfjs.AnnotationType.RICHMEDIA,
                pdfjs.AnnotationType.SCREEN,
                pdfjs.AnnotationType.SOUND,
                pdfjs.AnnotationType.THREED,
            ]),
        );
        const entries: DictionaryDocumentExtraction['entries'] = [];
        let blockIndex = 0;
        let totalPixels = 0;
        let totalOcrBytes = 0;
        for (
            let pageNumber = 1;
            pageNumber <= document.numPages;
            pageNumber += 1
        ) {
            const page = pages[pageNumber - 1]!;
            const textContent = await page.getTextContent();
            const lines: string[] = [];
            let line = '';
            for (const item of textContent.items) {
                if (!('str' in item)) continue;
                line += `${line ? ' ' : ''}${item.str}`;
                if (item.hasEOL) {
                    if (line.trim()) lines.push(line.trim());
                    line = '';
                }
            }
            if (line.trim()) lines.push(line.trim());
            if (lines.length > 0) {
                for (const text of lines)
                    entries.push({
                        block: {
                            kind: 'line',
                            location: { blockIndex: blockIndex++, pageNumber },
                            text,
                        },
                        kind: 'block',
                    });
                page.cleanup();
                continue;
            }
            const baseViewport = page.getViewport({ scale: 1 });
            const scale = Math.min(
                2,
                4_096 / Math.max(baseViewport.width, baseViewport.height),
            );
            const viewport = page.getViewport({ scale });
            const width = Math.ceil(viewport.width);
            const height = Math.ceil(viewport.height);
            const pixels = width * height;
            totalPixels += pixels;
            if (
                width < 1 ||
                height < 1 ||
                width >
                    documentIngestionLimitsV1.document
                        .maximumImageDimensionPixels ||
                height >
                    documentIngestionLimitsV1.document
                        .maximumImageDimensionPixels ||
                pixels > documentIngestionLimitsV1.document.maximumPagePixels ||
                totalPixels >
                    documentIngestionLimitsV1.document.maximumTotalPixels
            )
                throw new InvalidNativeDocumentError('pixel_limit');
            const canvas = createCanvas(width, height);
            await page.render({
                canvas,
                canvasContext: canvas.getContext('2d'),
                viewport,
            } as never).promise;
            const content = canvas.toBuffer('image/png');
            totalOcrBytes += content.byteLength;
            if (
                content.byteLength >
                    documentIngestionLimitsV1.ocr.maximumPageInputBytes ||
                totalOcrBytes >
                    documentIngestionLimitsV1.parser.maximumTemporaryBytes
            )
                throw new InvalidNativeDocumentError('pixel_limit');
            entries.push({
                kind: 'ocr-page',
                page: {
                    content,
                    heightPixels: height,
                    pageNumber,
                    widthPixels: width,
                },
            });
            page.cleanup();
        }
        return { entries, pageCount: document.numPages, totalPixels };
    } finally {
        await loadingTask.destroy();
    }
}

async function validateMagic(
    bytes: Uint8Array,
    mediaType: DictionaryDocumentMediaType,
): Promise<void> {
    const detected = await fileTypeFromBuffer(bytes);
    const expected = (
        {
            'application/pdf': 'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
                'application/zip',
            'image/jpeg': 'image/jpeg',
            'image/png': 'image/png',
            'image/webp': 'image/webp',
        } as Partial<Record<DictionaryDocumentMediaType, string>>
    )[mediaType];
    const docxDetected =
        mediaType ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
        (detected?.mime === 'application/zip' ||
            detected?.mime ===
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    if (expected && detected?.mime !== expected && !docxDetected)
        throw new InvalidNativeDocumentError('invalid_format');
    if (!expected && detected)
        throw new InvalidNativeDocumentError('invalid_format');
}

export async function parseNativeDictionaryDocument(input: {
    bytes: Uint8Array;
    mediaType: DictionaryDocumentMediaType;
}): Promise<DictionaryDocumentExtraction> {
    await validateMagic(input.bytes, input.mediaType);
    if (input.mediaType === 'text/plain')
        return {
            entries: textLines(strictText(input.bytes)).map((block) => ({
                block,
                kind: 'block' as const,
            })),
            pageCount: 1,
            totalPixels: 0,
        };
    if (input.mediaType === 'text/markdown')
        return {
            entries: markdownBlocks(strictText(input.bytes)).map((block) => ({
                block,
                kind: 'block' as const,
            })),
            pageCount: 1,
            totalPixels: 0,
        };
    if (
        input.mediaType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
        return {
            entries: parseDocx(input.bytes).map((block) => ({
                block,
                kind: 'block' as const,
            })),
            pageCount: 1,
            totalPixels: 0,
        };
    if (input.mediaType === 'application/pdf') return parsePdf(input.bytes);
    return parseImage(input.bytes, input.mediaType);
}
