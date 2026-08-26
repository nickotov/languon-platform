import type {
    DictionaryImportPairsGenerationJob,
    DictionaryPastedTermsGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

import {
    batchGenerationJobForDictionary,
    DictionaryBatchGenerationPanel,
} from '@/fsd/features/dictionary-batch-generation';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

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

const settings = {
    definitionEnabled: true,
    definitionLanguage: 'source',
    exampleEnabled: true,
    exampleLanguage: 'target',
    exampleTranslationEnabled: true,
    transcriptionCustomLabel: null,
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa',
} as const;
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
const dictionary = {
    activeCardCount: 0,
    archivedAt: null,
    createdAt: '2026-08-25T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'Arabic and English',
    settings: {
        updatedAt: '2026-08-25T10:00:00.000Z',
        values: settings,
        version: 2,
    },
    settingsVersion: 2,
    sourceDictionaryId: null,
    sourceLanguage: 'ar',
    targetLanguage: 'en',
    updatedAt: '2026-08-25T10:00:00.000Z',
    version: 3,
    visibility: 'private',
} satisfies OwnedDictionary;

function candidate(source: string, translation: string) {
    return {
        overrides,
        values: {
            definition: `تعريف ${source}`,
            example: `Example for ${translation}`,
            exampleTranslation: `مثال ${source}`,
            source,
            transcription: 'must not be committed',
            translation,
        },
    };
}

const reviewJob = {
    cancellationRequested: false,
    completedAt: null,
    createdAt: '2026-08-25T10:01:00.000Z',
    dictionaryId: dictionary.id,
    expectedDictionaryVersion: 3,
    expectedSettingsVersion: 2,
    expiresAt: '2026-09-01T10:01:00.000Z',
    failure: null,
    format: 'pasted-terms:v1',
    id: '30000000-0000-4000-8000-000000000001',
    kind: 'pasted-terms',
    outcome: null,
    progress: { percent: 100, stage: 'review_ready' },
    proposal: {
        candidates: [
            {
                candidate: candidate('<script>مصطلح</script>', 'term'),
                fieldFeedback: [
                    {
                        alternatives: ['word'],
                        field: 'translation',
                        reason: '<img src=x onerror=alert(1)>Check register',
                    },
                ],
                input: '<script>مصطلح</script>',
                rowIndex: 0,
            },
            {
                candidate: candidate('ثان', 'second'),
                fieldFeedback: [],
                input: 'ثان',
                rowIndex: 1,
            },
        ],
        failures: [
            {
                code: 'generation_failed',
                input: 'قابل للإعادة',
                message: 'Temporary failure',
                retryable: true,
                rowIndex: 2,
            },
            {
                code: 'invalid_term',
                input: 'غير صالح',
                message: 'Invalid term',
                retryable: false,
                rowIndex: 3,
            },
        ],
        warnings: [
            {
                code: 'duplicate_source',
                duplicateCardId: null,
                message: '<svg onload=alert(1)>Duplicate source',
                rowIndex: 0,
            },
        ],
    },
    sourceLanguage: 'ar',
    state: 'review',
    targetLanguage: 'en',
    updatedAt: '2026-08-25T10:02:00.000Z',
} satisfies DictionaryPastedTermsGenerationJob;
const runningJob = {
    ...reviewJob,
    expiresAt: null,
    progress: { percent: 38, stage: 'generating' },
    proposal: null,
    state: 'running',
} satisfies DictionaryPastedTermsGenerationJob;
const acceptedJob = {
    ...reviewJob,
    completedAt: '2026-08-25T10:03:00.000Z',
    expiresAt: null,
    outcome: {
        cards: [
            {
                cardId: '40000000-0000-4000-8000-000000000001',
                cardVersion: 1,
                rowIndex: 0,
            },
        ],
        dictionaryVersion: 4,
        warnings: [
            {
                code: 'duplicate_source',
                duplicateCardId: null,
                message: 'A matching source appears earlier in this batch.',
                rowIndex: 0,
            },
        ],
    },
    progress: { percent: 100, stage: 'terminal' },
    proposal: null,
    state: 'accepted',
    updatedAt: '2026-08-25T10:03:00.000Z',
} satisfies DictionaryPastedTermsGenerationJob;
const importReviewJob = {
    ...reviewJob,
    format: 'import-pairs:v1',
    id: '30000000-0000-4000-8000-000000000009',
    kind: 'import-pairs',
    proposal: {
        candidates: [
            {
                candidate: candidate('مصرف', 'bank'),
                fieldFeedback: [],
                rowIndex: 8,
                source: 'مصرف',
                translation: 'bank',
            },
        ],
        failures: [],
        warnings: [],
    },
} satisfies DictionaryImportPairsGenerationJob;

function panel(
    props: Partial<Parameters<typeof DictionaryBatchGenerationPanel>[0]> = {},
) {
    const callbacks = {
        onAccept: vi.fn().mockResolvedValue(undefined),
        onCancel: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
        onDiscard: vi.fn().mockResolvedValue(undefined),
        onReloadConflict: vi.fn().mockResolvedValue(undefined),
        onRetryFailures: vi.fn().mockResolvedValue(undefined),
        onStart: vi.fn().mockResolvedValue(undefined),
    };
    const result = render(
        <DictionaryBatchGenerationPanel
            available
            dictionary={dictionary}
            job={reviewJob}
            languages={languages}
            pendingAction={false}
            {...callbacks}
            {...props}
        />,
    );
    return {
        ...result,
        ...callbacks,
        rerender: (ui: ReactElement) =>
            result.rerender(
                <I18nProvider locale='en' messages={en}>
                    {ui}
                </I18nProvider>,
            ),
    };
}

describe('dictionary pasted-term batch generation', () => {
    it('renders trusted imported pairs in the same editable final review', async () => {
        const user = userEvent.setup();
        const onAccept = vi.fn().mockResolvedValue(undefined);
        panel({ job: importReviewJob, onAccept });

        const source = screen.getByLabelText('Source phrase');
        expect(source).toHaveValue('مصرف');
        expect(source).toHaveAttribute('lang', 'ar');
        expect(source).toHaveAttribute('dir', 'rtl');
        expect(screen.getByLabelText('Translation')).toHaveValue('bank');
        await user.click(screen.getByRole('button', { name: 'Add 1 cards' }));
        expect(onAccept).toHaveBeenCalledWith([
            expect.objectContaining({ rowIndex: 8 }),
        ]);
    });

    it('renders duplicate warnings retained with an accepted outcome', () => {
        panel({ job: acceptedJob });
        expect(
            screen.getByText(
                'A matching source appears earlier in this batch.',
            ),
        ).toBeInTheDocument();
    });

    it('rejects a pasted job restored under another dictionary URL', () => {
        expect(
            batchGenerationJobForDictionary(
                reviewJob,
                '10000000-0000-4000-8000-000000000099',
            ),
        ).toBeNull();
        expect(batchGenerationJobForDictionary(reviewJob, dictionary.id)).toBe(
            reviewJob,
        );
    });

    it('submits trimmed shared input and context without authorship input', async () => {
        const onStart = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryBatchGenerationPanel
                available
                dictionary={dictionary}
                languages={languages}
                onAccept={vi.fn()}
                onCancel={vi.fn()}
                onClose={vi.fn()}
                onDiscard={vi.fn()}
                onReloadConflict={vi.fn()}
                onRetryFailures={vi.fn()}
                onStart={onStart}
                pendingAction={false}
            />,
        );
        const user = userEvent.setup();
        await user.type(
            screen.getByLabelText('Terms or phrases'),
            '  واحد\nاثنان  ',
        );
        await user.type(screen.getByLabelText(/^Context/), '  legal context  ');
        expect(screen.getByLabelText(/^Context/)).toHaveAttribute('dir', 'rtl');
        expect(screen.getByLabelText(/^Context/)).toHaveAttribute('lang', 'ar');
        await user.click(
            screen.getByRole('button', { name: 'Generate cards' }),
        );

        expect(onStart).toHaveBeenCalledWith({
            context: 'legal context',
            text: 'واحد\nاثنان',
        });
        expect(screen.queryByLabelText(/authorship/i)).not.toBeInTheDocument();
    });

    it('keeps inert row drafts and selections across a same-job refetch, then commits only enabled selected fields', async () => {
        const user = userEvent.setup();
        const { onAccept, rerender } = panel();
        const sourceInputs = screen.getAllByLabelText('Source phrase');
        await user.clear(sourceInputs[0]!);
        await user.type(sourceInputs[0]!, 'مصطلح محرر');
        await user.click(
            screen.getByRole('checkbox', { name: 'Include row 2' }),
        );

        rerender(
            <DictionaryBatchGenerationPanel
                available
                dictionary={dictionary}
                job={{ ...reviewJob, proposal: { ...reviewJob.proposal! } }}
                languages={languages}
                onAccept={onAccept}
                onCancel={vi.fn()}
                onClose={vi.fn()}
                onDiscard={vi.fn()}
                onReloadConflict={vi.fn()}
                onRetryFailures={vi.fn()}
                onStart={vi.fn()}
                pendingAction={false}
            />,
        );

        expect(screen.getAllByLabelText('Source phrase')[0]).toHaveValue(
            'مصطلح محرر',
        );
        expect(
            screen.getByRole('checkbox', { name: 'Include row 2' }),
        ).not.toBeChecked();
        expect(
            screen.queryByLabelText('Transcription'),
        ).not.toBeInTheDocument();
        expect(screen.getAllByLabelText('Definition')[0]).toHaveAttribute(
            'dir',
            'rtl',
        );
        expect(screen.getAllByLabelText('Context example')[0]).toHaveAttribute(
            'dir',
            'ltr',
        );
        expect(
            screen.getAllByLabelText('Example translation')[0],
        ).toHaveAttribute('dir', 'rtl');
        expect(
            screen.getByText('<svg onload=alert(1)>Duplicate source'),
        ).toBeInTheDocument();
        expect(document.querySelector('script, svg, img')).toBeNull();
        await user.click(
            screen.getAllByRole('button', { name: 'Remove row' })[1]!,
        );
        expect(
            screen.queryByRole('checkbox', { name: 'Include row 2' }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Add 1 cards' }));
        expect(onAccept).toHaveBeenCalledWith([
            expect.objectContaining({
                candidate: expect.objectContaining({
                    values: expect.objectContaining({
                        source: 'مصطلح محرر',
                        transcription: null,
                    }),
                }),
                rowIndex: 0,
            }),
        ]);
    });

    it('shows persisted progress and disables every action while a mutation is pending', () => {
        panel({ job: runningJob, pendingAction: true });
        expect(
            screen.getByRole('progressbar', {
                name: 'Batch generation progress',
            }),
        ).toHaveValue(38);
        expect(
            screen.getByRole('button', { name: 'Cancel generation' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Close batch generation' }),
        ).toBeDisabled();
    });

    it('retries only selected retryable persisted failures as a successor request', async () => {
        const user = userEvent.setup();
        const { onRetryFailures } = panel();
        expect(
            screen.queryByRole('checkbox', { name: 'غير صالح' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('checkbox', { name: 'Retry row 3' }),
        ).toBeChecked();
        await user.click(
            screen.getByRole('button', { name: 'Retry selected failures' }),
        );
        expect(onRetryFailures).toHaveBeenCalledWith([
            expect.objectContaining({ input: 'قابل للإعادة', retryable: true }),
        ]);
    });

    it('keeps retained review and acceptance available while successor enqueue is disabled', () => {
        panel({ available: false });
        expect(
            screen.getByRole('button', { name: 'Retry selected failures' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Add 2 cards' }),
        ).toBeEnabled();
    });

    it('preserves review work and blocks commit while a recoverable conflict is visible', async () => {
        const user = userEvent.setup();
        const onReloadConflict = vi.fn().mockResolvedValue(undefined);
        panel({ conflict: true, onReloadConflict });
        expect(
            screen.getByRole('button', { name: 'Add 2 cards' }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Reload current versions' }),
        );
        expect(onReloadConflict).toHaveBeenCalledOnce();
        expect(screen.getAllByLabelText('Source phrase')[0]).toHaveValue(
            '<script>مصطلح</script>',
        );
    });
});
