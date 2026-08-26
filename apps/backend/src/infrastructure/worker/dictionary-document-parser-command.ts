import { open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { DictionaryDocumentMediaTypeSchema } from '@languon/contracts';

import { documentIngestionLimitsV1 } from '../../modules/dictionaries/domain/document-ingestion';
import { parseNativeDictionaryDocument } from '../../modules/dictionaries/infrastructure/document/native-document-parser';

async function readInput(): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const value of process.stdin) {
        const chunk = value as Buffer;
        length += chunk.byteLength;
        if (length > documentIngestionLimitsV1.upload.maximumFileBytes)
            throw new Error('input_limit');
        chunks.push(chunk);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
    if (args.length !== 1) throw new Error('invalid_arguments');
    const mediaType = DictionaryDocumentMediaTypeSchema.parse(args[0]);
    const extraction = await parseNativeDictionaryDocument({
        bytes: await readInput(),
        mediaType,
    });
    const entries = [];
    let outputBytes = 0;
    for (const entry of extraction.entries) {
        if (entry.kind === 'block') {
            entries.push(entry);
            continue;
        }
        outputBytes += entry.page.content.byteLength;
        if (
            outputBytes > documentIngestionLimitsV1.parser.maximumTemporaryBytes
        )
            throw new Error('output_limit');
        const contentPath = `page-${entry.page.pageNumber}.png`;
        const handle = await open(`/output/${contentPath}`, 'wx', 0o600);
        try {
            await handle.writeFile(entry.page.content);
            await handle.sync();
        } finally {
            await handle.close();
        }
        entries.push({
            kind: 'ocr-page' as const,
            page: {
                contentPath,
                heightPixels: entry.page.heightPixels,
                pageNumber: entry.page.pageNumber,
                widthPixels: entry.page.widthPixels,
            },
        });
    }
    const payload = JSON.stringify({
        entries,
        pageCount: extraction.pageCount,
        totalPixels: extraction.totalPixels,
    });
    if (
        Buffer.byteLength(payload, 'utf8') >
        documentIngestionLimitsV1.parser.maximumIpcOutputBytes
    )
        throw new Error('output_limit');
    process.stdout.write(payload);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(() => {
        process.stderr.write('Dictionary document parser failed.\n');
        process.exitCode = 1;
    });
}
