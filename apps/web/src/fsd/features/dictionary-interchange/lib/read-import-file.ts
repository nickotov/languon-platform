import { dictionaryInterchangeLimitsV1 } from '@languon/contracts';

export class DictionaryImportFileError extends Error {
    public constructor(public readonly reason: 'invalid_utf8' | 'too_large') {
        super(`Dictionary import file failed (${reason}).`);
        this.name = 'DictionaryImportFileError';
    }
}

export async function readDictionaryImportFile(file: File): Promise<string> {
    if (file.size > dictionaryInterchangeLimitsV1.maximumInputUtf8Bytes)
        throw new DictionaryImportFileError('too_large');
    const bytes = await file.arrayBuffer();
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        throw new DictionaryImportFileError('invalid_utf8');
    }
}
