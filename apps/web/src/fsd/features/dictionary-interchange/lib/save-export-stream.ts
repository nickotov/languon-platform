const maximumFallbackBytes = 32 * 1_024 * 1_024;

function pickerMimeType(contentType: string): string {
    return contentType.split(';', 1)[0]?.trim() || 'application/octet-stream';
}

export class DictionaryExportSaveError extends Error {
    public constructor(public readonly reason: 'streaming_required') {
        super(`Dictionary export save failed (${reason}).`);
        this.name = 'DictionaryExportSaveError';
    }
}

interface FilePickerWindow extends Window {
    showSaveFilePicker?: (options: {
        suggestedName: string;
        types: Array<{
            accept: Record<string, string[]>;
            description: string;
        }>;
    }) => Promise<{
        createWritable(): Promise<WritableStream<Uint8Array>>;
    }>;
}

async function boundedBlob(response: Response): Promise<Blob> {
    if (!response.body) throw new Error('Export response has no body.');
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maximumFallbackBytes) {
                await reader.cancel('dictionary_export_fallback_limit');
                throw new DictionaryExportSaveError('streaming_required');
            }
            const copy = new Uint8Array(value.byteLength);
            copy.set(value);
            chunks.push(copy.buffer);
        }
    } finally {
        reader.releaseLock();
    }
    return new Blob(chunks, {
        type:
            response.headers.get('content-type') ?? 'application/octet-stream',
    });
}

export async function saveDictionaryExport(input: {
    contentType: string;
    description: string;
    load(): Promise<{ filename: string; response: Response }>;
    suggestedName: string;
}): Promise<'cancelled' | 'saved'> {
    const picker = window as FilePickerWindow;
    if (picker.showSaveFilePicker) {
        let handle;
        try {
            handle = await picker.showSaveFilePicker({
                suggestedName: input.suggestedName,
                types: [
                    {
                        accept: {
                            [pickerMimeType(input.contentType)]: [
                                input.suggestedName.endsWith('.csv')
                                    ? '.csv'
                                    : '.txt',
                            ],
                        },
                        description: input.description,
                    },
                ],
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError')
                return 'cancelled';
            throw error;
        }
        const writable = await handle.createWritable();
        try {
            const loaded = await input.load();
            if (!loaded.response.body)
                throw new Error('Export response has no body.');
            await loaded.response.body.pipeTo(writable);
        } catch (error) {
            await writable.abort(error).catch(() => undefined);
            throw error;
        }
        return 'saved';
    }
    const loaded = await input.load();
    const blob = await boundedBlob(loaded.response);
    const url = URL.createObjectURL(blob);
    try {
        const anchor = document.createElement('a');
        anchor.download = loaded.filename;
        anchor.href = url;
        anchor.click();
    } finally {
        URL.revokeObjectURL(url);
    }
    return 'saved';
}

export async function copyDictionaryExport(response: Response): Promise<void> {
    const blob = await boundedBlob(response);
    await navigator.clipboard.writeText(await blob.text());
}
