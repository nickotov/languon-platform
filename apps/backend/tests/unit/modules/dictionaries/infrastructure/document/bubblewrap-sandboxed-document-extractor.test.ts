import { mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
    parseSandboxParserManifest,
    readSandboxOcrOutputs,
} from '../../../../../../src/modules/dictionaries/infrastructure/document/bubblewrap-sandboxed-document-extractor';

const directories: string[] = [];

async function directory() {
    const value = await mkdtemp(join(tmpdir(), 'languon-ocr-output-test-'));
    directories.push(value);
    return value;
}

function entry(pageNumber: number) {
    return {
        kind: 'ocr-page' as const,
        page: {
            contentPath: `page-${pageNumber}.png`,
            heightPixels: 1,
            pageNumber,
            widthPixels: 1,
        },
    };
}

afterEach(async () => {
    await Promise.all(
        directories
            .splice(0)
            .map((value) => rm(value, { force: true, recursive: true })),
    );
});

describe('bubblewrap OCR output validation', () => {
    it('bounds manifest entries and rejects duplicate OCR pages or paths', () => {
        const manifest = (entries: ReturnType<typeof entry>[]) => ({
            entries,
            pageCount: 100,
            totalPixels: 0,
        });
        expect(() =>
            parseSandboxParserManifest(
                manifest(
                    Array.from({ length: 201 }, (_, index) =>
                        entry((index % 100) + 1),
                    ),
                ),
            ),
        ).toThrow();
        expect(() =>
            parseSandboxParserManifest(manifest([entry(1), entry(1)])),
        ).toThrow('OCR output paths must be unique');
        expect(() =>
            parseSandboxParserManifest(
                manifest([
                    entry(1),
                    {
                        ...entry(2),
                        page: { ...entry(2).page, pageNumber: 1 },
                    },
                ]),
            ),
        ).toThrow('OCR page numbers must be unique');
    });

    it('reads regular output files sequentially within the aggregate bound', async () => {
        const output = await directory();
        await writeFile(join(output, 'page-1.png'), Buffer.from('png'));

        await expect(
            readSandboxOcrOutputs(
                output,
                [entry(1)],
                new AbortController().signal,
            ),
        ).resolves.toMatchObject([
            { kind: 'ocr-page', page: { content: Buffer.from('png') } },
        ]);
    });

    it('rejects child-created symlinks and non-basename paths', async () => {
        const output = await directory();
        const hostDirectory = await directory();
        const hostFile = join(hostDirectory, 'host-secret');
        await writeFile(hostFile, Buffer.from('secret'));
        await symlink(hostFile, join(output, 'page-1.png'));

        await expect(
            readSandboxOcrOutputs(
                output,
                [entry(1)],
                new AbortController().signal,
            ),
        ).rejects.toThrow('regular file');
        await expect(
            readSandboxOcrOutputs(
                output,
                [
                    {
                        ...entry(1),
                        page: {
                            ...entry(1).page,
                            contentPath: '../host-secret',
                        },
                    },
                ],
                new AbortController().signal,
            ),
        ).rejects.toThrow('path is invalid');
    });

    it('rejects aggregate output above 128 MiB before buffering files', async () => {
        const output = await directory();
        const entries = Array.from({ length: 17 }, (_, index) =>
            entry(index + 1),
        );
        await Promise.all(
            entries.map((value) =>
                writeFile(
                    join(output, value.page.contentPath),
                    Buffer.alloc(0),
                ).then(() =>
                    truncate(
                        join(output, value.page.contentPath),
                        8 * 1_024 * 1_024,
                    ),
                ),
            ),
        );

        await expect(
            readSandboxOcrOutputs(
                output,
                entries,
                new AbortController().signal,
            ),
        ).rejects.toThrow('aggregate bound');
    });
});
