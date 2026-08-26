import type {
    DictionaryDocumentTermsGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { DictionaryDocumentGenerationPanel } from '@/fsd/features/dictionary-document-generation';

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
const dictionary = {
    activeCardCount: 0,
    archivedAt: null,
    createdAt: '2026-08-26T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: false,
    lifecycle: 'active',
    name: 'Arabic terms',
    settings: {
        updatedAt: '2026-08-26T10:00:00.000Z',
        values: {
            definitionEnabled: true,
            definitionLanguage: 'source',
            exampleEnabled: false,
            exampleLanguage: 'source',
            exampleTranslationEnabled: false,
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
        version: 1,
    },
    settingsVersion: 1,
    sourceDictionaryId: null,
    sourceLanguage: 'ar',
    targetLanguage: 'en',
    updatedAt: '2026-08-26T10:00:00.000Z',
    version: 1,
    visibility: 'private',
} satisfies OwnedDictionary;
const overrides = {
    definitionEnabled: null,
    definitionLanguage: null,
    exampleEnabled: null,
    exampleLanguage: null,
    exampleTranslationEnabled: null,
    transcriptionCustomLabel: null,
    transcriptionEnabled: null,
    transcriptionNotation: null,
} as const;
const reviewJob = {
    cancellationRequested: false,
    completedAt: null,
    createdAt: '2026-08-26T10:01:00.000Z',
    dictionaryId: dictionary.id,
    expectedDictionaryVersion: 1,
    expectedSettingsVersion: 1,
    expiresAt: '2026-09-02T10:01:00.000Z',
    failure: null,
    format: 'document-terms:v1',
    id: '30000000-0000-4000-8000-000000000001',
    kind: 'document-terms',
    outcome: null,
    progress: { percent: 100, stage: 'review_ready' },
    proposal: {
        candidates: [
            {
                candidate: {
                    overrides,
                    values: {
                        definition: 'تعريف',
                        example: null,
                        exampleTranslation: null,
                        source: '<script>مصطلح</script>',
                        transcription: null,
                        translation: 'term',
                    },
                },
                fieldFeedback: [],
                input: '<script>مصطلح</script>',
                rowIndex: 0,
            },
        ],
        failures: [],
        warnings: [],
    },
    sourceLanguage: 'ar',
    state: 'review',
    targetLanguage: 'en',
    updatedAt: '2026-08-26T10:02:00.000Z',
} satisfies DictionaryDocumentTermsGenerationJob;

function callbacks() {
    return {
        onAccept: vi.fn().mockResolvedValue(undefined),
        onCancel: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
        onDiscard: vi.fn().mockResolvedValue(undefined),
        onReloadConflict: vi.fn().mockResolvedValue(undefined),
        onRetryFailures: vi.fn().mockResolvedValue(undefined),
        onStart: vi.fn().mockResolvedValue(undefined),
    };
}

describe('dictionary document generation panel', () => {
    it('selects one supported file and submits source-language instruction metadata', async () => {
        const handlers = callbacks();
        render(
            <DictionaryDocumentGenerationPanel
                available
                dictionary={dictionary}
                languages={languages}
                nativeExtractionAvailable
                ocrAvailable={false}
                pendingAction={false}
                {...handlers}
            />,
        );
        const user = userEvent.setup();
        const file = new File(['مصطلح'], 'terms.txt', { type: 'text/plain' });
        const fileInput = screen.getByLabelText('Document');
        await user.upload(fileInput, file);
        expect(fileInput).toHaveProperty('files.length', 1);
        await user.type(
            screen.getByLabelText(/^Generation instruction/),
            '  legal context  ',
        );
        expect(
            screen.getByLabelText(/^Generation instruction/),
        ).toHaveAttribute('dir', 'rtl');
        const submit = screen.getByRole('button', {
            name: 'Upload and generate cards',
        });
        expect(submit).toBeEnabled();
        fireEvent.submit(submit.closest('form')!);
        await waitFor(() =>
            expect(handlers.onStart).toHaveBeenCalledWith({
                file,
                instruction: 'legal context',
            }),
        );
        expect(screen.getByText(/OCR is unavailable/)).toBeInTheDocument();
    });

    it('renders inert mixed-direction editable final review and commits selection', async () => {
        const handlers = callbacks();
        render(
            <DictionaryDocumentGenerationPanel
                available
                dictionary={dictionary}
                job={reviewJob}
                languages={languages}
                nativeExtractionAvailable
                ocrAvailable
                pendingAction={false}
                {...handlers}
            />,
        );
        const user = userEvent.setup();
        expect(document.querySelector('script')).toBeNull();
        expect(screen.getByLabelText('Source phrase')).toHaveAttribute(
            'dir',
            'rtl',
        );
        expect(screen.getByLabelText('Translation')).toHaveAttribute(
            'dir',
            'ltr',
        );
        await user.clear(screen.getByLabelText('Translation'));
        await user.type(screen.getByLabelText('Translation'), 'edited term');
        await user.click(screen.getByRole('button', { name: 'Add 1 cards' }));
        expect(handlers.onAccept).toHaveBeenCalledWith([
            expect.objectContaining({
                candidate: expect.objectContaining({
                    values: expect.objectContaining({
                        translation: 'edited term',
                    }),
                }),
                rowIndex: 0,
            }),
        ]);
    });

    it('retries only selected retryable document failures through a successor', async () => {
        const handlers = callbacks();
        render(
            <DictionaryDocumentGenerationPanel
                available
                dictionary={dictionary}
                job={{
                    ...reviewJob,
                    proposal: {
                        ...reviewJob.proposal,
                        failures: [
                            {
                                code: 'generation_failed',
                                input: 'مصطلح قابل للإعادة',
                                message: 'Try this term again.',
                                retryable: true,
                                rowIndex: 1,
                            },
                            {
                                code: 'invalid_input',
                                input: 'مصطلح غير صالح',
                                message: 'Upload a corrected document.',
                                retryable: false,
                                rowIndex: 2,
                            },
                        ],
                    },
                }}
                languages={languages}
                nativeExtractionAvailable
                ocrAvailable
                pendingAction={false}
                {...handlers}
            />,
        );
        const user = userEvent.setup();
        const retryable = screen.getByRole('checkbox', {
            name: 'Retry extracted term 2',
        });
        expect(retryable).toBeChecked();
        expect(
            screen.queryByRole('checkbox', {
                name: 'Retry extracted term 3',
            }),
        ).not.toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: 'Retry selected failures' }),
        );
        expect(handlers.onRetryFailures).toHaveBeenCalledWith([
            expect.objectContaining({ rowIndex: 1 }),
        ]);
    });

    it('keeps processing actions unavailable while an upload mutation is pending', () => {
        render(
            <DictionaryDocumentGenerationPanel
                available
                dictionary={dictionary}
                job={{
                    ...reviewJob,
                    expiresAt: null,
                    progress: { percent: 18, stage: 'scanning' },
                    proposal: null,
                    state: 'running',
                }}
                languages={languages}
                nativeExtractionAvailable
                ocrAvailable
                pendingAction
                {...callbacks()}
            />,
        );
        expect(
            screen.getByRole('progressbar', {
                name: 'Document generation progress',
            }),
        ).toHaveValue(18);
        expect(
            screen.getByRole('button', { name: 'Cancel processing' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Close document generation' }),
        ).toBeDisabled();
    });
});
