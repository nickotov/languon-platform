import type {
    LanguageCatalogEntry,
    PreviewDictionaryImportResponse,
} from '@languon/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';

import {
    copyDictionaryExport,
    DictionaryExportSaveError,
    DictionaryImportPanel,
    readDictionaryImportFile,
    saveDictionaryExport,
} from '@/fsd/features/dictionary-interchange';

import { render } from './render';

const languages = [
    {
        direction: 'rtl',
        displayNames: {
            en: 'Arabic',
            es: 'Árabe',
            fr: 'Arabe',
            ru: 'Арабский',
        },
        tag: 'ar',
    },
    {
        direction: 'ltr',
        displayNames: {
            en: 'English',
            es: 'Inglés',
            fr: 'Anglais',
            ru: 'Английский',
        },
        tag: 'en',
    },
] satisfies LanguageCatalogEntry[];

const preview = {
    capacity: { remainingRows: 9_999, wouldExceed: false },
    columns: [
        { heading: null, index: 0, samples: ['مصرف'] },
        { heading: null, index: 1, samples: ['bank'] },
    ],
    failures: [],
    rows: [{ rowIndex: 0, source: 'مصرف', translation: 'bank' }],
    summary: {
        duplicateRows: 0,
        failureRows: 0,
        readyRows: 1,
        totalRows: 1,
        truncated: false,
    },
    warnings: [],
} satisfies PreviewDictionaryImportResponse;

describe('dictionary interchange', () => {
    it('surfaces advisory capacity and blocks an oversized deterministic commit', async () => {
        const user = userEvent.setup();
        const onCommit = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryImportPanel
                aiAvailable={false}
                languages={languages}
                onCommit={onCommit}
                onPreview={vi.fn().mockResolvedValue(undefined)}
                optionalFieldsEnabled
                pending={false}
                preview={{
                    ...preview,
                    capacity: { remainingRows: 0, wouldExceed: true },
                }}
                sourceLanguage='ar'
                target={{
                    dictionaryId: '10000000-0000-4000-8000-000000000001',
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    kind: 'existing',
                }}
                targetLanguage='en'
            />,
        );

        await user.type(screen.getByLabelText('Import text'), 'مصرف\tbank');
        await user.click(
            screen.getByRole('button', { name: 'Preview import' }),
        );
        expect(
            await screen.findByText(/can accept 0 more rows/u),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Import 1 cards' }),
        ).toBeDisabled();
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('requires a fresh preview after raw input changes and tags pair languages', async () => {
        const user = userEvent.setup();
        const onPreview = vi.fn().mockResolvedValue(undefined);
        const onCommit = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryImportPanel
                aiAvailable
                languages={languages}
                onCommit={onCommit}
                onPreview={onPreview}
                optionalFieldsEnabled
                pending={false}
                preview={preview}
                sourceLanguage='ar'
                target={{
                    dictionaryId: '10000000-0000-4000-8000-000000000001',
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    kind: 'existing',
                }}
                targetLanguage='en'
            />,
        );

        const content = screen.getByLabelText('Import text');
        await user.type(content, 'مصرف\tbank');
        await user.click(
            screen.getByRole('button', { name: 'Preview import' }),
        );

        expect(await screen.findByText('مصرف')).toHaveAttribute('lang', 'ar');
        expect(screen.getByText('مصرف')).toHaveAttribute('dir', 'rtl');
        expect(screen.getByText('bank')).toHaveAttribute('lang', 'en');
        expect(screen.getByText('bank')).toHaveAttribute('dir', 'ltr');

        await user.type(content, '\nميناء\tharbor');
        expect(screen.queryByText('مصرف')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Import 1 ready row' }),
        ).not.toBeInTheDocument();
        expect(onCommit).not.toHaveBeenCalled();
    });

    it('allows selecting the 100 previewed pairs when the full import is larger', async () => {
        const user = userEvent.setup();
        const largePreview = {
            ...preview,
            capacity: { remainingRows: 9_999, wouldExceed: false },
            rows: Array.from({ length: 100 }, (_, rowIndex) => ({
                rowIndex,
                source: `source-${rowIndex}`,
                translation: `target-${rowIndex}`,
            })),
            summary: {
                ...preview.summary,
                readyRows: 101,
                totalRows: 101,
                truncated: true,
            },
        } satisfies PreviewDictionaryImportResponse;
        function Harness() {
            const [currentPreview, setCurrentPreview] = useState(preview);
            return (
                <DictionaryImportPanel
                    aiAvailable
                    languages={languages}
                    onCommit={vi.fn().mockResolvedValue(undefined)}
                    onPreview={async (request) => {
                        if (request.content.includes('second'))
                            setCurrentPreview(largePreview);
                    }}
                    optionalFieldsEnabled
                    pending={false}
                    preview={currentPreview}
                    sourceLanguage='ar'
                    target={{
                        dictionaryId: '10000000-0000-4000-8000-000000000001',
                        expectedDictionaryVersion: 3,
                        expectedSettingsVersion: 2,
                        kind: 'existing',
                    }}
                    targetLanguage='en'
                />
            );
        }
        render(<Harness />);

        const content = screen.getByLabelText('Import text');
        await user.type(content, 'first\tuno');
        await user.click(
            screen.getByRole('button', { name: 'Preview import' }),
        );
        await user.click(screen.getByRole('switch', { name: /enrich/iu }));
        expect(
            screen.getByRole('button', { name: 'Generate 1 card reviews' }),
        ).toBeEnabled();

        await user.type(content, '\nsecond\tdos');
        await user.click(
            screen.getByRole('button', { name: 'Preview import' }),
        );
        expect(
            await screen.findByRole('button', {
                name: 'Generate 100 card reviews',
            }),
        ).toBeEnabled();
        expect(
            screen.getByText(/this is a sample of the import/iu),
        ).toBeVisible();
        expect(
            screen.getByText(/up to 100 pairs from this preview/iu),
        ).toBeVisible();
    });

    it('fatally rejects invalid UTF-8 file bytes', async () => {
        const file = new File([new Uint8Array([0xc3, 0x28])], 'terms.csv', {
            type: 'text/csv',
        });
        await expect(readDictionaryImportFile(file)).rejects.toMatchObject({
            reason: 'invalid_utf8',
        });
    });

    it('fails closed when a non-streaming browser would buffer more than 32 MiB', async () => {
        const cancel = vi.fn();
        const response = new Response(
            new ReadableStream({
                cancel,
                start(controller) {
                    controller.enqueue(new Uint8Array(32 * 1_024 * 1_024 + 1));
                },
            }),
        );
        await expect(copyDictionaryExport(response)).rejects.toBeInstanceOf(
            DictionaryExportSaveError,
        );
        expect(cancel).toHaveBeenCalledWith('dictionary_export_fallback_limit');
    });

    it('uses a parameter-free MIME type for the native file picker', async () => {
        let resolvePicker!: (value: {
            createWritable(): Promise<WritableStream<Uint8Array>>;
        }) => void;
        const showSaveFilePicker = vi.fn().mockResolvedValue({
            createWritable: () => Promise.resolve(new WritableStream()),
        });
        showSaveFilePicker.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolvePicker = resolve;
                }),
        );
        const load = vi.fn().mockResolvedValue({
            filename: 'dictionary.csv',
            response: new Response('source,translation', {
                headers: { 'Content-Type': 'text/csv; charset=utf-8' },
            }),
        });
        Object.defineProperty(window, 'showSaveFilePicker', {
            configurable: true,
            value: showSaveFilePicker,
        });

        try {
            const saved = saveDictionaryExport({
                contentType: 'text/csv; charset=utf-8',
                description: 'Exportación del diccionario',
                load,
                suggestedName: 'dictionary.csv',
            });
            expect(load).not.toHaveBeenCalled();
            resolvePicker({
                createWritable: () => Promise.resolve(new WritableStream()),
            });
            await saved;
        } finally {
            Reflect.deleteProperty(window, 'showSaveFilePicker');
        }

        expect(showSaveFilePicker).toHaveBeenCalledWith(
            expect.objectContaining({
                types: [
                    expect.objectContaining({
                        accept: { 'text/csv': ['.csv'] },
                        description: 'Exportación del diccionario',
                    }),
                ],
            }),
        );
        expect(load).toHaveBeenCalledOnce();
    });

    it('treats native picker cancellation as a no-op before starting export', async () => {
        const load = vi.fn();
        Object.defineProperty(window, 'showSaveFilePicker', {
            configurable: true,
            value: vi
                .fn()
                .mockRejectedValue(new DOMException('cancelled', 'AbortError')),
        });
        try {
            await expect(
                saveDictionaryExport({
                    contentType: 'text/csv; charset=utf-8',
                    description: 'Dictionary export',
                    load,
                    suggestedName: 'dictionary.csv',
                }),
            ).resolves.toBe('cancelled');
        } finally {
            Reflect.deleteProperty(window, 'showSaveFilePicker');
        }
        expect(load).not.toHaveBeenCalled();
    });

    it('aborts the selected writable when export loading fails', async () => {
        const writable = new WritableStream<Uint8Array>();
        const abort = vi.spyOn(writable, 'abort');
        Object.defineProperty(window, 'showSaveFilePicker', {
            configurable: true,
            value: vi.fn().mockResolvedValue({
                createWritable: () => Promise.resolve(writable),
            }),
        });
        try {
            await expect(
                saveDictionaryExport({
                    contentType: 'text/csv; charset=utf-8',
                    description: 'Dictionary export',
                    load: vi.fn().mockRejectedValue(new Error('network lost')),
                    suggestedName: 'dictionary.csv',
                }),
            ).rejects.toThrow('network lost');
        } finally {
            Reflect.deleteProperty(window, 'showSaveFilePicker');
        }
        expect(abort).toHaveBeenCalledOnce();
    });
});
