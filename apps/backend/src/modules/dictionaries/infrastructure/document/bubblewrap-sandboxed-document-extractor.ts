import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { constants } from 'node:fs';
import { lstat, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { z } from 'zod';

import type {
    DictionaryDocumentExtraction,
    SandboxedDocumentExtractor,
} from '../../application/ports/sandboxed-document-extractor';
import {
    DictionaryDocumentBlockSchema,
    documentIngestionLimitsV1,
} from '../../domain/document-ingestion';

const ParserManifestSchema = z
    .object({
        entries: z
            .array(
                z.discriminatedUnion('kind', [
                    z
                        .object({
                            block: DictionaryDocumentBlockSchema,
                            kind: z.literal('block'),
                        })
                        .strict(),
                    z
                        .object({
                            kind: z.literal('ocr-page'),
                            page: z
                                .object({
                                    contentPath: z
                                        .string()
                                        .regex(/^page-(?:[1-9]\d{0,2})\.png$/u),
                                    heightPixels: z
                                        .number()
                                        .int()
                                        .min(1)
                                        .max(16_384),
                                    pageNumber: z
                                        .number()
                                        .int()
                                        .min(1)
                                        .max(100),
                                    widthPixels: z
                                        .number()
                                        .int()
                                        .min(1)
                                        .max(16_384),
                                })
                                .strict(),
                        })
                        .strict(),
                ]),
            )
            .max(200),
        pageCount: z.number().int().min(1).max(100),
        totalPixels: z.number().int().min(0).max(250_000_000),
    })
    .strict()
    .superRefine((manifest, context) => {
        const paths = new Set<string>();
        const pages = new Set<number>();
        for (const entry of manifest.entries) {
            if (entry.kind !== 'ocr-page') continue;
            if (paths.has(entry.page.contentPath))
                context.addIssue({
                    code: 'custom',
                    message: 'OCR output paths must be unique.',
                    path: ['entries'],
                });
            if (pages.has(entry.page.pageNumber))
                context.addIssue({
                    code: 'custom',
                    message: 'OCR page numbers must be unique.',
                    path: ['entries'],
                });
            if (entry.page.pageNumber > manifest.pageCount)
                context.addIssue({
                    code: 'custom',
                    message: 'OCR page number exceeds the document page count.',
                    path: ['entries'],
                });
            paths.add(entry.page.contentPath);
            pages.add(entry.page.pageNumber);
        }
    });

type ParserManifest = z.infer<typeof ParserManifestSchema>;
const maximumParserAddressSpaceBytes = 256 * 1_024 * 1_024;

export function parseSandboxParserManifest(value: unknown): ParserManifest {
    return ParserManifestSchema.parse(value);
}

export interface BubblewrapSandboxedDocumentExtractorOptions {
    applicationRoot: string;
    bubblewrapPath?: string;
    nodePath?: string;
    parserEntryPath: string;
    prlimitPath?: string;
}

function terminate(child: ChildProcessWithoutNullStreams): void {
    if (!child.pid) return;
    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch {
        child.kill('SIGKILL');
    }
}

async function writeInput(
    child: ChildProcessWithoutNullStreams,
    content: AsyncIterable<Uint8Array>,
    signal: AbortSignal,
): Promise<void> {
    let length = 0;
    for await (const chunk of content) {
        signal.throwIfAborted();
        length += chunk.byteLength;
        if (length > documentIngestionLimitsV1.upload.maximumFileBytes)
            throw new Error('Sandbox parser input exceeds its bound.');
        if (!child.stdin.write(chunk))
            await new Promise<void>((resolve, reject) => {
                child.stdin.once('drain', resolve);
                child.stdin.once('error', reject);
            });
    }
    child.stdin.end();
}

async function collectOutput(
    child: ChildProcessWithoutNullStreams,
    signal: AbortSignal,
): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const value of child.stdout) {
        signal.throwIfAborted();
        const chunk = value as Buffer;
        length += chunk.byteLength;
        if (length > documentIngestionLimitsV1.parser.maximumIpcOutputBytes)
            throw new Error('Sandbox parser output exceeds its bound.');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function readRegularFileNoFollow(
    path: string,
    maximumBytes: number,
    signal: AbortSignal,
): Promise<Uint8Array> {
    const observed = await lstat(path);
    if (observed.isSymbolicLink() || !observed.isFile())
        throw new Error('Sandbox OCR output must be a regular file.');
    if (observed.size > maximumBytes)
        throw new Error('Sandbox OCR page exceeds its bound.');
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
        const opened = await handle.stat();
        if (
            !opened.isFile() ||
            opened.dev !== observed.dev ||
            opened.ino !== observed.ino
        )
            throw new Error('Sandbox OCR output changed during validation.');
        const content = Buffer.allocUnsafe(observed.size);
        let position = 0;
        while (position < content.byteLength) {
            signal.throwIfAborted();
            const result = await handle.read(
                content,
                position,
                Math.min(64 * 1_024, content.byteLength - position),
                position,
            );
            if (result.bytesRead === 0)
                throw new Error('Sandbox OCR output changed during reading.');
            position += result.bytesRead;
        }
        const trailing = Buffer.allocUnsafe(1);
        if ((await handle.read(trailing, 0, 1, position)).bytesRead !== 0)
            throw new Error('Sandbox OCR output changed during reading.');
        return content;
    } finally {
        await handle.close();
    }
}

export async function readSandboxOcrOutputs(
    outputDirectory: string,
    entries: ParserManifest['entries'],
    signal: AbortSignal,
): Promise<DictionaryDocumentExtraction['entries']> {
    const ocrEntries = entries.filter((entry) => entry.kind === 'ocr-page');
    const expectedNames = new Set<string>();
    let aggregateBytes = 0;
    for (const entry of ocrEntries) {
        const contentPath = entry.page.contentPath;
        if (
            basename(contentPath) !== contentPath ||
            expectedNames.has(contentPath)
        )
            throw new Error('Sandbox OCR output path is invalid.');
        expectedNames.add(contentPath);
        const observed = await lstat(join(outputDirectory, contentPath));
        if (observed.isSymbolicLink() || !observed.isFile())
            throw new Error('Sandbox OCR output must be a regular file.');
        aggregateBytes += observed.size;
        if (
            observed.size >
                documentIngestionLimitsV1.ocr.maximumPageInputBytes ||
            aggregateBytes >
                documentIngestionLimitsV1.parser.maximumTemporaryBytes
        )
            throw new Error('Sandbox OCR output exceeds its aggregate bound.');
    }
    const directoryNames = await readdir(outputDirectory);
    if (
        directoryNames.length !== expectedNames.size ||
        directoryNames.some((name) => !expectedNames.has(name))
    )
        throw new Error('Sandbox output directory contains unexpected files.');

    const validated: DictionaryDocumentExtraction['entries'] = [];
    let actualAggregateBytes = 0;
    for (const entry of entries) {
        if (entry.kind === 'block') {
            validated.push(entry);
            continue;
        }
        const remainingBytes =
            documentIngestionLimitsV1.parser.maximumTemporaryBytes -
            actualAggregateBytes;
        const content = await readRegularFileNoFollow(
            join(outputDirectory, entry.page.contentPath),
            Math.min(
                documentIngestionLimitsV1.ocr.maximumPageInputBytes,
                remainingBytes,
            ),
            signal,
        );
        actualAggregateBytes += content.byteLength;
        validated.push({
            kind: 'ocr-page',
            page: {
                content,
                heightPixels: entry.page.heightPixels,
                pageNumber: entry.page.pageNumber,
                widthPixels: entry.page.widthPixels,
            },
        });
    }
    return validated;
}

export class BubblewrapSandboxedDocumentExtractor implements SandboxedDocumentExtractor {
    public constructor(
        private readonly options: BubblewrapSandboxedDocumentExtractorOptions,
    ) {}

    public async readiness(signal: AbortSignal): Promise<void> {
        const result = await this.extract({
            content: {
                async *[Symbol.asyncIterator]() {
                    yield Buffer.from('readiness');
                },
            },
            mediaType: 'text/plain',
            signal,
        });
        if (result.entries.length !== 1)
            throw new Error('Sandbox parser readiness failed.');
    }

    public async extract(
        input: Parameters<SandboxedDocumentExtractor['extract']>[0],
    ) {
        input.signal.throwIfAborted();
        const outputDirectory = await mkdtemp(
            join(tmpdir(), 'languon-document-parser-'),
        );
        const timeoutSignal = AbortSignal.timeout(
            documentIngestionLimitsV1.parser.wallTimeMs,
        );
        const signal = AbortSignal.any([input.signal, timeoutSignal]);
        const child = spawn(
            this.options.prlimitPath ?? '/usr/bin/prlimit',
            [
                `--cpu=${Math.ceil(
                    documentIngestionLimitsV1.parser.cpuTimeMs / 1_000,
                )}`,
                // Linux prlimit --as constrains virtual address space, not
                // measured RSS. Together with V8's heap ceiling it is the
                // enforceable process-memory bound available in this runtime;
                // readiness must not describe it as an RSS measurement.
                `--as=${maximumParserAddressSpaceBytes}`,
                `--fsize=${documentIngestionLimitsV1.ocr.maximumPageInputBytes}`,
                `--nproc=${documentIngestionLimitsV1.parser.maximumPids}`,
                '--',
                this.options.bubblewrapPath ?? '/usr/bin/bwrap',
                '--die-with-parent',
                '--new-session',
                '--unshare-all',
                '--clearenv',
                '--ro-bind',
                '/usr',
                '/usr',
                '--ro-bind-try',
                '/lib',
                '/lib',
                '--ro-bind-try',
                '/lib64',
                '/lib64',
                '--ro-bind',
                this.options.applicationRoot,
                this.options.applicationRoot,
                '--dev',
                '/dev',
                '--tmpfs',
                '/tmp',
                '--bind',
                outputDirectory,
                '/output',
                '--chdir',
                '/tmp',
                '--setenv',
                'PATH',
                '/usr/local/bin:/usr/bin:/bin',
                this.options.nodePath ?? '/usr/local/bin/node',
                '--max-old-space-size=192',
                this.options.parserEntryPath,
                input.mediaType,
            ],
            { detached: true, env: {}, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        const abort = () => terminate(child);
        signal.addEventListener('abort', abort, { once: true });
        let stderrLength = 0;
        child.stderr.on('data', (value: Buffer) => {
            stderrLength += value.byteLength;
            if (stderrLength > 4_096) terminate(child);
        });
        try {
            const [stdout, exitCode] = await Promise.all([
                collectOutput(child, signal),
                new Promise<number | null>((resolve, reject) => {
                    child.once('error', reject);
                    child.once('close', resolve);
                }),
                writeInput(child, input.content, signal),
            ]);
            signal.throwIfAborted();
            if (exitCode !== 0)
                throw new Error('Sandbox parser returned a failure.');
            const manifest = parseSandboxParserManifest(
                JSON.parse(
                    new TextDecoder('utf-8', { fatal: true }).decode(stdout),
                ),
            );
            return {
                entries: await readSandboxOcrOutputs(
                    outputDirectory,
                    manifest.entries,
                    signal,
                ),
                pageCount: manifest.pageCount,
                totalPixels: manifest.totalPixels,
            };
        } finally {
            signal.removeEventListener('abort', abort);
            terminate(child);
            await rm(outputDirectory, { force: true, recursive: true });
        }
    }
}
