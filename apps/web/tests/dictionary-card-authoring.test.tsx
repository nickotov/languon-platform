import type {
    DictionaryCard,
    DictionaryCardAuthoringGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
    DictionaryCardForm,
    discardedSuggestionIdsForPredecessor,
    hasLoadedSourceDuplicate,
    normalizeDictionarySource,
    previewCardEffectiveSettings,
    planCardAuthoringCleanup,
    resolveCardAuthoringCleanupRead,
    retainCardAuthoringIdempotencyAttempt,
} from '@/fsd/features/dictionary-card-authoring';
import { DictionaryCardList } from '@/fsd/features/dictionary-card-list';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';

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
    {
        direction: 'ltr',
        displayNames: {
            en: 'Spanish',
            es: 'Español',
            fr: 'Espagnol',
            ru: 'Испанский',
        },
        tag: 'es',
    },
] as LanguageCatalogEntry[];

const dictionary: OwnedDictionary = {
    activeCardCount: 1,
    archivedAt: null,
    createdAt: '2026-08-21T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'Studio Spanish',
    settings: {
        updatedAt: '2026-08-21T10:00:00.000Z',
        values: {
            definitionEnabled: false,
            definitionLanguage: 'source',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
        version: 1,
    },
    settingsVersion: 1,
    sourceDictionaryId: null,
    sourceLanguage: 'en',
    targetLanguage: 'es',
    updatedAt: '2026-08-21T10:00:00.000Z',
    version: 1,
    visibility: 'private',
};

const card: DictionaryCard = {
    archivedAt: null,
    authorship: 'human',
    createdAt: '2026-08-21T10:00:00.000Z',
    dictionaryId: dictionary.id,
    effectiveSettings: {
        definitionEnabled: false,
        definitionLanguage: 'source',
        exampleEnabled: true,
        exampleLanguage: 'source',
        exampleTranslationEnabled: true,
        exampleTranslationLanguage: 'target',
        transcriptionCustomLabel: null,
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa',
    },
    id: '20000000-0000-4000-8000-000000000001',
    lifecycle: 'active',
    overrides: {
        definitionEnabled: null,
        definitionLanguage: null,
        exampleEnabled: null,
        exampleLanguage: null,
        exampleTranslationEnabled: null,
        transcriptionCustomLabel: null,
        transcriptionEnabled: null,
        transcriptionNotation: null,
    },
    position: '1000',
    settingsVersion: 1,
    updatedAt: '2026-08-21T10:00:00.000Z',
    values: {
        definition: '<img src=x onerror=alert(1)>',
        example: 'The curator draws a distinction.',
        exampleTranslation: 'La comisaria establece una distinción.',
        source: '<script>alert(1)</script>',
        transcription: null,
        translation: 'establecer una distinción',
    },
    version: 1,
};

const authoringProposal = {
    source: 'medium',
    suggestions: [
        {
            field: 'translation' as const,
            id: '40000000-0000-4000-8000-000000000001',
            value: 'medio',
        },
    ],
};

const authoringReviewJob = {
    cancellationRequested: false,
    completedAt: null,
    createdAt: '2026-08-26T10:00:00.000Z',
    dictionaryId: dictionary.id,
    expectedDictionaryVersion: 1,
    expectedSettingsVersion: 1,
    expiresAt: '2026-08-26T11:00:00.000Z',
    failure: null,
    format: 'card-authoring:v1',
    id: '30000000-0000-4000-8000-000000000001',
    kind: 'card-authoring',
    outcome: null,
    progress: { percent: 100, stage: 'review_ready' },
    proposal: authoringProposal,
    sourceLanguage: 'en',
    state: 'review',
    targetLanguage: 'es',
    updatedAt: '2026-08-26T10:01:00.000Z',
} satisfies DictionaryCardAuthoringGenerationJob;

const authoringSuccessorJob = {
    ...authoringReviewJob,
    completedAt: null,
    expiresAt: null,
    id: '30000000-0000-4000-8000-000000000002',
    progress: { percent: 25, stage: 'generating' },
    proposal: null,
    state: 'running',
} satisfies DictionaryCardAuthoringGenerationJob;

describe('dictionary settings and card authoring', () => {
    it('scopes discarded IDs to the latest predecessor and plans manual-save cleanup', () => {
        const removedId = '40000000-0000-4000-8000-000000000001';
        expect(
            discardedSuggestionIdsForPredecessor(
                new Set([removedId]),
                authoringProposal,
            ),
        ).toEqual([removedId]);
        expect(
            discardedSuggestionIdsForPredecessor(new Set([removedId]), {
                source: 'medium',
                suggestions: [],
            }),
        ).toEqual([]);
        expect(
            planCardAuthoringCleanup(authoringSuccessorJob, authoringReviewJob),
        ).toEqual({
            cancelJobIds: [authoringSuccessorJob.id],
            discardJobIds: [authoringReviewJob.id],
        });
        expect(resolveCardAuthoringCleanupRead(authoringReviewJob)).toBe(
            'discard',
        );
        expect(resolveCardAuthoringCleanupRead(authoringSuccessorJob)).toBe(
            'retry',
        );
        expect(
            resolveCardAuthoringCleanupRead({
                ...authoringReviewJob,
                completedAt: '2026-08-26T10:02:00.000Z',
                expiresAt: null,
                progress: { percent: 100, stage: 'terminal' },
                proposal: null,
                state: 'discarded',
            }),
        ).toBe('complete');
    });

    it('blocks Save while a successor is active but keeps proposal review available', async () => {
        const user = userEvent.setup();
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    job: authoringSuccessorJob,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal: authoringProposal,
                    successorActive: true,
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), 'medium');
        expect(
            screen.getByRole('button', { name: 'Save card' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Accept Translation suggestion',
            }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', { name: 'Regenerate Translation' }),
        ).toBeDisabled();
    });
    it('retains a payload-scoped idempotency key after an ambiguous attempt', () => {
        const first = retainCardAuthoringIdempotencyAttempt(
            null,
            'same-payload',
            () => 'first-key',
        );
        expect(
            retainCardAuthoringIdempotencyAttempt(
                first,
                'same-payload',
                () => 'should-not-run',
            ),
        ).toBe(first);
        expect(
            retainCardAuthoringIdempotencyAttempt(
                first,
                'changed-payload',
                () => 'second-key',
            ),
        ).toEqual({ fingerprint: 'changed-payload', key: 'second-key' });
    });

    it('generates from source only and applies AI suggestions atomically', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn().mockResolvedValue(undefined);
        const onSave = vi.fn().mockResolvedValue(undefined);
        const proposal = {
            source: 'medium',
            suggestions: [
                {
                    field: 'translation' as const,
                    id: '40000000-0000-4000-8000-000000000001',
                    value: 'medio',
                },
                {
                    field: 'translation' as const,
                    id: '40000000-0000-4000-8000-000000000002',
                    value: 'entorno',
                },
            ],
        };
        const { unmount } = render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction,
                    pending: false,
                    proposal: null,
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        expect(
            screen.queryByRole('button', { name: 'Generate with AI' }),
        ).not.toBeInTheDocument();
        await user.type(screen.getByLabelText(/Source phrase/), 'medium');
        await user.click(
            screen.getByRole('button', { name: 'Generate with AI' }),
        );
        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'generate',
                scope: { kind: 'all' },
                successor: false,
            }),
        );

        unmount();
        render(
            <DictionaryCardForm
                ai={{ available: true, onAction, pending: false, proposal }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), 'medium');
        await user.click(
            screen.getAllByRole('button', {
                name: 'Accept Translation suggestion',
            })[0]!,
        );
        expect(screen.getByLabelText(/^Translation ·/)).toHaveValue('medio');
        expect(screen.getByText('medio')).toBeInTheDocument();
        await user.click(
            screen.getAllByRole('button', {
                name: 'Discard Translation suggestion',
            })[0]!,
        );
        expect(screen.queryByText('medio')).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Translation ·/)).toHaveValue('medio');
        await user.click(
            screen.getByRole('button', { name: 'Regenerate Translation' }),
        );
        expect(onAction).toHaveBeenLastCalledWith(
            expect.objectContaining({
                discardedSuggestionIds: [
                    '40000000-0000-4000-8000-000000000001',
                ],
                scope: { field: 'translation', kind: 'field' },
                successor: true,
            }),
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Accept Translation suggestion',
            }),
        );
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({ translation: 'entorno' }),
            }),
            [
                {
                    field: 'translation',
                    suggestionId: '40000000-0000-4000-8000-000000000002',
                },
            ],
        );
        await user.clear(screen.getByLabelText(/^Translation ·/));
        await user.type(
            screen.getByLabelText(/^Translation ·/),
            'traducción manual',
        );
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    translation: 'traducción manual',
                }),
            }),
            [],
        );
    });

    it('gates generation with code-point and control-safe source validation', async () => {
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        const source = screen.getByLabelText(/Source phrase/);
        fireEvent.change(source, { target: { value: '😀'.repeat(200) } });
        expect(
            screen.getByRole('button', { name: 'Generate with AI' }),
        ).toBeEnabled();
        fireEvent.change(source, { target: { value: 'unsafe\u0085' } });
        expect(
            screen.queryByRole('button', { name: 'Generate with AI' }),
        ).not.toBeInTheDocument();
    });

    it('keeps manual authoring available when AI is unavailable and cancels only active generation', async () => {
        const user = userEvent.setup();
        const unavailable = render(
            <DictionaryCardForm
                ai={{
                    available: false,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), 'manual');
        expect(
            screen.getByText(/AI suggestions are unavailable/i),
        ).toBeVisible();
        await user.type(screen.getByLabelText(/^Translation ·/), 'manual');
        expect(screen.getByRole('button', { name: 'Save card' })).toBeEnabled();
        unavailable.unmount();

        const onAction = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    job: {
                        cancellationRequested: false,
                        completedAt: null,
                        createdAt: '2026-08-26T12:00:00.000Z',
                        dictionaryId: dictionary.id,
                        expectedDictionaryVersion: dictionary.version,
                        expectedSettingsVersion: dictionary.settings.version,
                        expiresAt: null,
                        failure: null,
                        format: 'card-authoring:v1',
                        id: '40000000-0000-4000-8000-000000000099',
                        kind: 'card-authoring',
                        outcome: null,
                        progress: { percent: 25, stage: 'generating' },
                        proposal: null,
                        sourceLanguage: dictionary.sourceLanguage,
                        state: 'running',
                        targetLanguage: dictionary.targetLanguage,
                        updatedAt: '2026-08-26T12:00:01.000Z',
                    },
                    onAction,
                    pending: false,
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), 'active');
        await user.type(screen.getByLabelText(/^Translation ·/), 'editable');
        await user.click(
            screen.getByRole('button', { name: 'Cancel generation' }),
        );
        expect(onAction).toHaveBeenCalledWith({ kind: 'cancel' });
        expect(screen.getByLabelText(/^Translation ·/)).toHaveValue('editable');
    });

    it('keeps previous-source suggestions visible but prevents their use', async () => {
        const user = userEvent.setup();
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal: {
                        source: 'medium',
                        suggestions: [
                            {
                                field: 'translation',
                                id: '40000000-0000-4000-8000-000000000001',
                                value: 'medio',
                            },
                        ],
                    },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), 'another');
        expect(screen.getByText(/source phrase changed/i)).toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Accept Translation suggestion',
            }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Generate with AI' }),
        ).toBeEnabled();
    });
    it('previews draft overrides without replacing server authority', () => {
        const effective = previewCardEffectiveSettings(
            dictionary.settings.values,
            {
                ...card.overrides,
                exampleEnabled: 'disabled',
                exampleTranslationEnabled: 'enabled',
                transcriptionEnabled: 'enabled',
            },
        );
        expect(effective.transcriptionEnabled).toBe(true);
        expect(effective.exampleEnabled).toBe(false);
        expect(effective.exampleTranslationEnabled).toBe(false);
    });

    it('preserves a dormant example-translation setting and uses the server lock flag', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionarySettingsForm
                dictionary={{ ...dictionary, activeCardCount: 0 }}
                languages={languages}
                onSave={onSave}
                pending={false}
            />,
        );
        expect(screen.getByLabelText('Translate from')).toBeDisabled();
        await user.click(screen.getByLabelText('Context example'));
        await user.click(screen.getByRole('button', { name: 'Save settings' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                settings: expect.objectContaining({
                    exampleEnabled: false,
                }),
            }),
        );
        expect(onSave.mock.calls[0]?.[0].settings).not.toHaveProperty(
            'exampleTranslationEnabled',
        );
    });

    it('captures editable metadata and language values before deferred state updates', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionarySettingsForm
                dictionary={{
                    ...dictionary,
                    activeCardCount: 0,
                    languagePairLocked: false,
                }}
                languages={languages}
                onSave={onSave}
                pending={false}
            />,
        );

        await user.clear(screen.getByLabelText('Name'));
        await user.type(screen.getByLabelText('Name'), 'Arabic studio');
        await user.type(screen.getByLabelText(/^Description/), 'RTL practice');
        await user.selectOptions(screen.getByLabelText('Translate from'), 'ar');
        await user.click(screen.getByRole('button', { name: 'Save settings' }));

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                description: 'RTL practice',
                name: 'Arabic studio',
                sourceLanguage: 'ar',
                targetLanguage: 'es',
            }),
        );
    });

    it('reveals a newly enabled field before save and blocks an invalid child enable', async () => {
        const user = userEvent.setup();
        render(
            <DictionaryCardForm
                dictionary={{
                    ...dictionary,
                    settings: {
                        ...dictionary.settings,
                        values: {
                            ...dictionary.settings.values,
                            exampleEnabled: false,
                        },
                    },
                }}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.click(screen.getByText('Advanced settings'));
        const transcriptionOverride = screen.getByLabelText('Transcription');
        await user.selectOptions(transcriptionOverride, 'enabled');
        expect(screen.getAllByLabelText('Transcription')).toHaveLength(2);
        const exampleTranslation = screen.getByLabelText('Example translation');
        expect(
            exampleTranslation.querySelector('option[value="enabled"]'),
        ).toBeDisabled();
    });

    it('allows normalized duplicates with a non-blocking different-context warning', async () => {
        expect(normalizeDictionarySource('  Ｍedium  ')).toBe('medium');
        expect(hasLoadedSourceDuplicate('MEDIUM', ['medium'])).toBe(true);
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                dictionary={dictionary}
                existingSources={['medium']}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        await user.type(screen.getByLabelText(/Source phrase/), ' Medium ');
        expect(screen.getByRole('status')).toHaveTextContent(
            'Different senses and contexts are allowed',
        );
        await user.type(
            screen.getByLabelText(/Translation/),
            'medio artístico',
        );
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalled();
    });

    it('uses catalog direction for mixed-language authoring and disables cancellation while saving', () => {
        render(
            <DictionaryCardForm
                dictionary={{
                    ...dictionary,
                    sourceLanguage: 'ar',
                    targetLanguage: 'en',
                }}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending
            />,
        );

        expect(screen.getByLabelText(/Source phrase/)).toHaveAttribute(
            'dir',
            'rtl',
        );
        expect(screen.getByLabelText(/Translation/)).toHaveAttribute(
            'dir',
            'ltr',
        );

        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    it('renders malicious card strings as inert text in responsive semantic DOM', () => {
        const { container } = render(
            <DictionaryCardList
                cards={[card]}
                dictionary={dictionary}
                languages={languages}
                lifecycle='active'
                onEdit={vi.fn()}
                onLifecycle={vi.fn()}
                onMove={vi.fn()}
                pending={false}
            />,
        );
        expect(
            screen.getByText('<script>alert(1)</script>'),
        ).toBeInTheDocument();
        expect(container.querySelector('script')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(container.querySelector('ol')).toBeInTheDocument();
        expect(container.querySelector('table')).toBeNull();
        expect(
            screen.getByRole('button', { name: 'Move earlier' }),
        ).toBeDisabled();
    });

    it('opens retained generation reviews when starting new work is unavailable', async () => {
        const user = userEvent.setup();
        const onGenerate = vi.fn();
        render(
            <DictionaryCardList
                cards={[card]}
                dictionary={dictionary}
                generationAvailable={false}
                languages={languages}
                lifecycle='active'
                onEdit={vi.fn()}
                onGenerate={onGenerate}
                onLifecycle={vi.fn()}
                onMove={vi.fn()}
                pending={false}
            />,
        );

        await user.click(
            screen.getByRole('button', {
                name: 'Card actions, card 1',
            }),
        );
        const openReview = screen.getByRole('menuitem', {
            name: 'Open AI review',
        });
        expect(openReview).toBeEnabled();
        await user.click(openReview);
        expect(onGenerate).toHaveBeenCalledWith(card);
    });
});
