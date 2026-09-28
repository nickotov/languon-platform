import type {
    DictionaryCard,
    DictionaryCardAuthoringGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
    DictionaryCardForm,
    cardAuthoringFailureMessageKey,
    discardedSuggestionIdsForPredecessor,
    hasLoadedSourceDuplicate,
    normalizeDictionarySource,
    previewCardEffectiveSettings,
    isFieldAffectedByGeneration,
    planCardAuthoringCleanup,
    resolveCardAuthoringCleanupRead,
    retainCardAuthoringIdempotencyAttempt,
} from '@/fsd/features/dictionary-card-authoring';
import {
    DictionaryCardList,
    useDictionaryCardDeletion,
} from '@/fsd/features/dictionary-card-list';
import { dictionaryApi } from '@/fsd/entities/dictionary';
import { DictionarySettingsForm } from '@/fsd/features/dictionary-settings';
import { shouldAcceptAuthoringProposal } from '@/fsd/widgets/dictionary-editor/ui/editor-card-sheet/editor-card-sheet';

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

describe('dependent card field generation', () => {
    it('marks coherent v2 dependency groups as affected', () => {
        expect(
            [
                'source',
                'translation',
                'transcription',
                'definition',
                'example',
                'exampleTranslation',
            ].filter((field) =>
                isFieldAffectedByGeneration(
                    field as keyof DictionaryCard['values'],
                    { kind: 'field', field: 'translation' },
                    card.effectiveSettings,
                    'card-authoring:v2',
                ),
            ),
        ).toEqual(['translation', 'example', 'exampleTranslation']);
        expect(
            ['example', 'exampleTranslation'].filter((field) =>
                isFieldAffectedByGeneration(
                    field as keyof DictionaryCard['values'],
                    { kind: 'field', field: 'example' },
                    card.effectiveSettings,
                    'card-authoring:v2',
                ),
            ),
        ).toEqual(['example', 'exampleTranslation']);
        expect(
            isFieldAffectedByGeneration(
                'exampleTranslation',
                { kind: 'field', field: 'example' },
                {
                    ...card.effectiveSettings,
                    exampleTranslationEnabled: false,
                },
                'card-authoring:v2',
            ),
        ).toBe(false);
        expect(
            isFieldAffectedByGeneration(
                'exampleTranslation',
                { kind: 'field', field: 'example' },
                card.effectiveSettings,
                'card-authoring:v1',
            ),
        ).toBe(false);
    });
});

function ArchivedCardDeletionHarness({ empty = false }: { empty?: boolean }) {
    const [outcome, setOutcome] = useState('');
    const archivedCard = {
        ...card,
        archivedAt: '2026-08-22T10:00:00.000Z',
        lifecycle: 'archived' as const,
        version: 3,
    };
    const cards = empty ? [] : [archivedCard];
    const deletion = useDictionaryCardDeletion({
        cards,
        dictionaryId: dictionary.id,
        dictionaryVersion: 5,
        requestWithSession: (operation) => operation('token'),
        resetKey: 'archived:',
        setOutcome,
    });
    return (
        <>
            <p>{outcome}</p>
            <DictionaryCardList
                cards={cards}
                deletion={deletion}
                dictionary={dictionary}
                languages={languages}
                lifecycle='archived'
                onEdit={vi.fn()}
                onLifecycle={vi.fn()}
                onMove={vi.fn()}
                pending={false}
            />
        </>
    );
}

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

const versionedInitialProposal = {
    source: 'medium',
    suggestions: [
        {
            basisSource: 'medium',
            field: 'example' as const,
            id: '48000000-0000-4000-8000-000000000001',
            value: 'The room is medium-sized.',
        },
        {
            basisSource: 'medium',
            field: 'exampleTranslation' as const,
            id: '48000000-0000-4000-8000-000000000002',
            value: 'La habitación es mediana.',
        },
    ],
};

const versionedSuccessorProposal = {
    ...versionedInitialProposal,
    suggestions: [
        ...versionedInitialProposal.suggestions,
        {
            basisSource: 'medium',
            field: 'example' as const,
            id: '48000000-0000-4000-8000-000000000003',
            value: 'They chose a medium suitcase.',
        },
        {
            basisSource: 'medium',
            field: 'exampleTranslation' as const,
            id: '48000000-0000-4000-8000-000000000004',
            value: 'Eligieron una maleta mediana.',
        },
    ],
};

function VersionedAuthoringHarness({
    onAction,
    onSave,
}: {
    onAction: ReturnType<typeof vi.fn>;
    onSave: ReturnType<typeof vi.fn>;
}) {
    const [proposal, setProposal] = useState(versionedInitialProposal);

    async function handleAction(
        action: Parameters<
            NonNullable<
                ComponentProps<typeof DictionaryCardForm>['ai']
            >['onAction']
        >[0],
    ) {
        onAction(action);
        if (action.kind === 'generate') setProposal(versionedSuccessorProposal);
    }

    return (
        <DictionaryCardForm
            ai={{
                available: true,
                format: 'card-authoring:v2',
                job: authoringReviewJob,
                onAction: handleAction,
                pending: false,
                proposal,
            }}
            card={{
                ...card,
                values: {
                    ...card.values,
                    example: null,
                    exampleTranslation: null,
                    source: 'medium',
                },
            }}
            dictionary={dictionary}
            languages={languages}
            onCancel={vi.fn()}
            onSave={onSave}
            pending={false}
        />
    );
}

function GeneratingFieldHarness({
    format,
}: {
    format: 'card-authoring:v1' | 'card-authoring:v2';
}) {
    const [job, setJob] = useState<DictionaryCardAuthoringGenerationJob | null>(
        null,
    );

    async function startGeneration() {
        setJob({ ...authoringSuccessorJob, format });
    }

    return (
        <DictionaryCardForm
            ai={{
                available: true,
                format,
                job,
                onAction: startGeneration,
                pending: false,
                proposal: null,
            }}
            card={{
                ...card,
                values: { ...card.values, source: 'atelier' },
            }}
            dictionary={dictionary}
            languages={languages}
            onCancel={vi.fn()}
            onSave={vi.fn().mockResolvedValue(undefined)}
            pending={false}
        />
    );
}

describe('dictionary settings and card authoring', () => {
    it('renders v2 dependency progress while keeping v1 field-local', async () => {
        const user = userEvent.setup();
        const { unmount } = render(
            <GeneratingFieldHarness format='card-authoring:v2' />,
        );

        await user.click(
            screen.getByRole('button', {
                name: 'Generate Translation with AI',
            }),
        );
        expect(screen.getByLabelText(/^Source word or phrase \(/)).toHaveValue(
            'atelier',
        );
        expect(screen.getByTestId('ai-progress-translation')).toBeVisible();
        expect(screen.getByTestId('ai-progress-example')).toBeVisible();
        expect(
            screen.getByTestId('ai-progress-exampleTranslation'),
        ).toBeVisible();
        expect(
            screen.queryByRole('textbox', { name: /^Translation \(/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('textbox', { name: /^Context example \(/ }),
        ).not.toBeInTheDocument();

        unmount();
        render(<GeneratingFieldHarness format='card-authoring:v1' />);
        await user.click(
            screen.getByRole('button', {
                name: 'Generate Translation with AI',
            }),
        );
        expect(screen.getByTestId('ai-progress-translation')).toBeVisible();
        expect(screen.queryByTestId('ai-progress-example')).toBeNull();
        expect(screen.getByLabelText(/^Context example \(/)).toBeVisible();
        expect(screen.getByLabelText(/^Example translation \(/)).toBeVisible();
    });

    it('uses ordinary create and update saves when no AI suggestion remains selected', () => {
        expect(shouldAcceptAuthoringProposal(true, 0)).toBe(false);
        expect(shouldAcceptAuthoringProposal(false, 0)).toBe(false);
        expect(shouldAcceptAuthoringProposal(true, 1)).toBe(true);
    });

    it('keeps regenerated example forms as switchable versions with a fresh translation', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <VersionedAuthoringHarness
                onAction={onAction}
                onSave={onSave}
            />,
        );

        await user.click(
            screen.getByRole('button', {
                name: 'Accept Context example suggestion',
            }),
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Accept Example translation suggestion',
            }),
        );
        expect(screen.queryByText(/Version 1 of/)).not.toBeInTheDocument();

        await user.click(
            screen.getByRole('button', {
                name: 'Generate Context example with AI',
            }),
        );

        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: { field: 'example', kind: 'field' },
                successor: true,
            }),
        );
        expect(await screen.findByText('Version 2 of 2')).toBeVisible();
        expect(screen.getByTestId('ai-review-example')).toHaveTextContent(
            'They chose a medium suitcase.',
        );
        expect(
            screen.getByTestId('ai-review-exampleTranslation'),
        ).toHaveTextContent('Eligieron una maleta mediana.');

        await user.click(
            screen.getByRole('button', {
                name: 'Accept Context example suggestion',
            }),
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Accept Example translation suggestion',
            }),
        );
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'They chose a medium suitcase.',
        );
        expect(screen.getByLabelText(/^Example translation \(/)).toHaveValue(
            'Eligieron una maleta mediana.',
        );

        await user.click(
            screen.getByRole('button', { name: 'Previous form version' }),
        );
        expect(screen.getByText('Version 1 of 2')).toBeVisible();
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'The room is medium-sized.',
        );
        expect(screen.getByLabelText(/^Example translation \(/)).toHaveValue(
            'La habitación es mediana.',
        );
        expect(
            screen.getByRole('button', {
                name: 'Generate Context example with AI',
            }),
        ).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    example: 'The room is medium-sized.',
                    exampleTranslation: 'La habitación es mediana.',
                }),
            }),
            expect.arrayContaining([
                {
                    field: 'example',
                    suggestionId: '48000000-0000-4000-8000-000000000001',
                },
                {
                    field: 'exampleTranslation',
                    suggestionId: '48000000-0000-4000-8000-000000000002',
                },
            ]),
        );

        await user.click(
            screen.getByRole('button', { name: 'Next form version' }),
        );
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'They chose a medium suitcase.',
        );
        expect(
            screen.getByRole('button', { name: 'Next form version' }),
        ).toBeDisabled();
    });
    it.each([
        ['provider_rate_limited', 'dictionary.authoring.rateLimited'],
        ['provider_unavailable', 'dictionary.authoring.providerUnavailable'],
        ['provider_timeout', 'dictionary.authoring.timeout'],
        ['invalid_model_output', 'dictionary.authoring.failed'],
        ['retry_exhausted', 'dictionary.authoring.failed'],
        [
            'ai_credits_exhausted',
            'dictionary.generation.error.creditsExhausted',
        ],
        ['internal_error', 'dictionary.authoring.failed'],
        ['generation_conflict', 'dictionary.authoring.failed'],
        [null, 'dictionary.authoring.failed'],
        [undefined, 'dictionary.authoring.failed'],
    ] as const)(
        'maps safe failure code %s to localized feedback',
        (code, expected) => {
            expect(cardAuthoringFailureMessageKey(code)).toBe(expected);
        },
    );

    it('plans draft-discard cleanup before a job read or retained-review effect completes', () => {
        expect(
            planCardAuthoringCleanup(undefined, null, authoringSuccessorJob.id),
        ).toEqual({
            cancelJobIds: [authoringSuccessorJob.id],
            discardJobIds: [],
        });
        expect(planCardAuthoringCleanup(authoringReviewJob, null)).toEqual({
            cancelJobIds: [],
            discardJobIds: [authoringReviewJob.id],
        });
        expect(
            planCardAuthoringCleanup(authoringReviewJob, authoringReviewJob),
        ).toEqual({ cancelJobIds: [], discardJobIds: [authoringReviewJob.id] });
    });

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

    it.each([false, true])(
        'retains manual draft and predecessor choices after expiry (predecessor: %s)',
        async (retained) => {
            const user = userEvent.setup();
            const onSave = vi.fn().mockResolvedValue(undefined);
            const onAction = vi.fn().mockResolvedValue(undefined);
            const startingCard = {
                ...card,
                values: {
                    ...card.values,
                    source: 'medium',
                    translation: '',
                },
            };
            function ExpiringForm() {
                const [expired, setExpired] = useState(false);
                return (
                    <>
                        <button onClick={() => setExpired(true)}>
                            Expire generation
                        </button>
                        <DictionaryCardForm
                            ai={{
                                available: true,
                                job: {
                                    ...authoringSuccessorJob,
                                    state: expired ? 'expired' : 'running',
                                },
                                onAction,
                                pending: false,
                                proposal: retained ? authoringProposal : null,
                                successorActive: retained && !expired,
                            }}
                            card={startingCard}
                            dictionary={dictionary}
                            languages={languages}
                            onCancel={vi.fn()}
                            onSave={onSave}
                            pending={false}
                        />
                    </>
                );
            }
            render(<ExpiringForm />);
            if (retained) {
                await user.click(
                    screen.getByRole('button', {
                        name: 'Reject Translation suggestion',
                    }),
                );
            }
            await user.type(
                screen.getByLabelText(/Translation \(/),
                'manual translation',
            );
            expect(screen.getByRole('status')).toHaveTextContent(/Generating/);
            await user.click(
                screen.getByRole('button', { name: 'Expire generation' }),
            );
            expect(
                screen.getByText(/suggestions expired/i),
            ).toBeInTheDocument();
            expect(
                screen.queryByText('Generating suggestions…'),
            ).not.toBeInTheDocument();
            expect(screen.getByLabelText(/Source word or phrase/)).toHaveValue(
                'medium',
            );
            expect(
                screen.getByDisplayValue('manual translation'),
            ).toBeInTheDocument();
            const generate = screen.getByRole('button', {
                name: retained ? 'Regenerate all fields' : 'Generate all',
            });
            expect(generate).toBeEnabled();
            expect(screen.queryByText('medio')).not.toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'Save card' }));
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    values: expect.objectContaining({
                        source: 'medium',
                        translation: 'manual translation',
                    }),
                }),
                [],
            );
        },
    );

    it('reports new draft content and override changes, and returns to clean when reverted', async () => {
        const user = userEvent.setup();
        const onDirtyChange = vi.fn();
        render(
            <DictionaryCardForm
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onDirtyChange={onDirtyChange}
                onSave={vi.fn()}
                pending={false}
            />,
        );
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        const source = screen.getByLabelText(/Source word or phrase/);
        await user.type(source, '   ');
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        await user.type(source, 'word');
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await user.clear(source);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        const example = screen.getByLabelText(/Context example \(/);
        await user.type(example, 'Only optional content');
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await user.clear(example);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        const override = screen.getByRole('switch', {
            name: 'Override dictionary settings for this card',
        });
        await user.click(override);
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await user.click(override);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });

    it('compares an existing card with its initial values and overrides', async () => {
        const user = userEvent.setup();
        const onDirtyChange = vi.fn();
        render(
            <DictionaryCardForm
                card={card}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onDirtyChange={onDirtyChange}
                onSave={vi.fn()}
                pending={false}
            />,
        );
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        const source = screen.getByLabelText(/Source word or phrase/);
        await user.type(source, ' changed');
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        fireEvent.change(source, { target: { value: card.values.source } });
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
        const override = screen.getByRole('switch', {
            name: 'Override dictionary settings for this card',
        });
        await user.click(override);
        expect(onDirtyChange).toHaveBeenLastCalledWith(true);
        await user.click(override);
        expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    });

    it('expands retained choices and keeps regeneration scoped to the field', async () => {
        const user = userEvent.setup();
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    job: authoringReviewJob,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal: {
                        ...authoringProposal,
                        suggestions: Array.from({ length: 3 }, (_, index) => ({
                            ...authoringProposal.suggestions[0]!,
                            id: `choice-${index}`,
                            value: `translation choice ${index + 1}`,
                        })),
                    },
                }}
                card={{
                    ...card,
                    values: { ...card.values, source: 'medium' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        expect(screen.getByText('translation choice 3')).toBeInTheDocument();
        expect(screen.getByText('translation choice 1')).not.toBeVisible();
        expect(
            screen.getAllByRole('button', {
                name: 'Generate Translation with AI',
            }),
        ).toHaveLength(1);
        await user.click(screen.getByText('Previous AI options (2)'));
        expect(screen.getByText('translation choice 1')).toBeInTheDocument();
    });

    it('blocks Save while a successor is active but keeps proposal review available', async () => {
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
                card={{
                    ...card,
                    values: { ...card.values, source: 'medium' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        expect(
            screen.getByRole('button', { name: 'Save card' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', {
                name: 'Accept Translation suggestion',
            }),
        ).toBeEnabled();
        expect(
            screen.getByRole('button', {
                name: 'Generate Translation with AI',
            }),
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
            screen.getByRole('button', { name: 'Generate all' }),
        ).toBeDisabled();
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'medium',
        );
        await user.click(screen.getByRole('button', { name: 'Generate all' }));
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
                card={{
                    ...card,
                    values: {
                        ...card.values,
                        source: 'medium',
                        translation: '',
                    },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        expect(screen.getByTestId('ai-review-translation')).toHaveTextContent(
            'entorno',
        );
        await user.click(
            within(screen.getByTestId('ai-review-translation')).getAllByRole(
                'button',
                {
                    name: 'Accept Translation suggestion',
                },
            )[0]!,
        );
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue('entorno');
        await user.click(
            screen.getByRole('button', {
                name: 'Generate Translation with AI',
            }),
        );
        expect(onAction).toHaveBeenLastCalledWith(
            expect.objectContaining({
                discardedSuggestionIds: [],
                scope: { field: 'translation', kind: 'field' },
                successor: true,
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
        await user.clear(screen.getByLabelText(/^Translation \(/));
        await user.type(
            screen.getByLabelText(/^Translation \(/),
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

    it('accepts the latest available suggestion for every field', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        const proposal = {
            source: 'medium',
            suggestions: [
                {
                    field: 'translation' as const,
                    id: '41000000-0000-4000-8000-000000000001',
                    value: 'medio',
                },
                {
                    field: 'translation' as const,
                    id: '41000000-0000-4000-8000-000000000002',
                    value: 'entorno',
                },
                {
                    field: 'example' as const,
                    id: '41000000-0000-4000-8000-000000000003',
                    value: 'A medium-sized room.',
                },
                {
                    field: 'example' as const,
                    id: '41000000-0000-4000-8000-000000000004',
                    value: 'A second example.',
                },
                {
                    field: 'exampleTranslation' as const,
                    id: '41000000-0000-4000-8000-000000000005',
                    value: 'Una habitación mediana.',
                },
                {
                    field: 'definition' as const,
                    id: '41000000-0000-4000-8000-000000000006',
                    value: 'Disabled field content',
                },
            ],
        };

        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal,
                }}
                card={{
                    ...card,
                    values: {
                        ...card.values,
                        source: 'medium',
                        translation: '',
                    },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );

        expect(screen.getByText('Choices: 5 · Fields: 3')).toBeInTheDocument();
        const translationReview = screen.getByTestId('ai-review-translation');
        await user.click(
            within(translationReview).getByText('Previous AI options (1)'),
        );
        await user.click(
            within(translationReview).getAllByRole('button', {
                name: 'Accept Translation suggestion',
            })[1]!,
        );
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue('medio');

        await user.click(screen.getByRole('button', { name: 'Accept all' }));
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue('entorno');
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'A second example.',
        );
        expect(screen.getByLabelText(/^Example translation \(/)).toHaveValue(
            'Una habitación mediana.',
        );
        expect(
            screen.getByRole('button', { name: 'Accept all' }),
        ).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Reject all' }));
        expect(
            screen.queryByRole('button', { name: 'Reject all' }),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue('entorno');
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'A second example.',
        );

        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    example: 'A second example.',
                    exampleTranslation: 'Una habitación mediana.',
                    translation: 'entorno',
                }),
            }),
            [],
        );
    });

    it('reviews a normalized Source before dependent results and rejects them together', async () => {
        const user = userEvent.setup();
        const proposal = {
            source: 'alarmer',
            sourceResult: {
                kind: 'suggested' as const,
                suggestionId: '43000000-0000-4000-8000-000000000001',
            },
            sourceSuggestions: [
                {
                    field: 'source' as const,
                    id: '43000000-0000-4000-8000-000000000001',
                    value: "s'alarmer",
                },
            ],
            suggestions: [
                {
                    basisSource: "s'alarmer",
                    field: 'translation' as const,
                    id: '43000000-0000-4000-8000-000000000002',
                    value: 'to become alarmed',
                },
            ],
        };

        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal,
                }}
                card={{
                    ...card,
                    values: { ...card.values, source: 'alarmer' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );

        expect(
            screen.queryByRole('textbox', { name: /Source word or phrase/ }),
        ).toBeNull();
        expect(screen.getByTestId('ai-review-source')).toHaveTextContent(
            "s'alarmer",
        );
        expect(
            within(screen.getByTestId('ai-review-translation')).getByRole(
                'button',
                { name: 'Accept Translation suggestion' },
            ),
        ).toBeDisabled();

        await user.click(
            within(screen.getByTestId('ai-review-source')).getByRole('button', {
                name: 'Reject Source suggestion',
            }),
        );

        expect(screen.getByLabelText(/Source word or phrase/)).toHaveValue(
            'alarmer',
        );
        expect(screen.queryByTestId('ai-review-source')).toBeNull();
        expect(screen.queryByTestId('ai-review-translation')).toBeNull();
    });

    it('accepts Source first, unlocks dependent results, and saves their provenance', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        const sourceId = '44000000-0000-4000-8000-000000000001';
        const translationId = '44000000-0000-4000-8000-000000000002';
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal: {
                        source: 'alarmer',
                        sourceResult: {
                            kind: 'suggested',
                            suggestionId: sourceId,
                        },
                        sourceSuggestions: [
                            {
                                field: 'source',
                                id: sourceId,
                                value: "s'alarmer",
                            },
                        ],
                        suggestions: [
                            {
                                basisSource: "s'alarmer",
                                field: 'translation',
                                id: translationId,
                                value: 'to become alarmed',
                            },
                        ],
                    },
                }}
                card={{
                    ...card,
                    values: { ...card.values, source: 'alarmer' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );

        await user.click(
            within(screen.getByTestId('ai-review-source')).getByRole('button', {
                name: 'Accept Source suggestion',
            }),
        );
        expect(screen.getByLabelText(/Source word or phrase/)).toHaveValue(
            "s'alarmer",
        );
        const translationReview = screen.getByTestId('ai-review-translation');
        const acceptTranslation = within(translationReview).getByRole(
            'button',
            { name: 'Accept Translation suggestion' },
        );
        expect(acceptTranslation).toBeEnabled();
        await user.click(acceptTranslation);
        await user.click(screen.getByRole('button', { name: 'Save card' }));

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({ source: "s'alarmer" }),
            }),
            [
                { field: 'source', suggestionId: sourceId },
                { field: 'translation', suggestionId: translationId },
            ],
        );
    });

    it('labels review as a group and clears AI provenance after a manual Source edit', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        const sourceId = '45000000-0000-4000-8000-000000000001';
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal: {
                        source: 'alarmer',
                        sourceResult: {
                            kind: 'suggested',
                            suggestionId: sourceId,
                        },
                        sourceSuggestions: [
                            {
                                field: 'source',
                                id: sourceId,
                                value: "s'alarmer",
                            },
                        ],
                        suggestions: [
                            {
                                basisSource: "s'alarmer",
                                field: 'translation',
                                id: '45000000-0000-4000-8000-000000000002',
                                value: 'to become alarmed',
                            },
                        ],
                    },
                }}
                card={{
                    ...card,
                    values: { ...card.values, source: 'alarmer' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );

        const sourceReview = screen.getByRole('group', {
            name: /Source word or phrase/,
        });
        expect(sourceReview).not.toHaveAttribute('required');
        expect(sourceReview).toHaveAttribute('aria-labelledby');
        await user.click(
            within(sourceReview).getByRole('button', {
                name: 'Accept Source suggestion',
            }),
        );
        await user.type(
            screen.getByRole('textbox', { name: /Source word or phrase/ }),
            ' manually changed',
        );

        expect(screen.queryByTestId('ai-review-translation')).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(expect.any(Object), []);
    });

    it('preserves accepted Source provenance when a successor rebases its history', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        const sourceId = '46000000-0000-4000-8000-000000000001';
        const startingCard = {
            ...card,
            values: { ...card.values, source: 'alarmer' },
        };

        function RebasedProposal() {
            const [rebased, setRebased] = useState(false);
            return (
                <>
                    <button onClick={() => setRebased(true)}>
                        Rebase proposal
                    </button>
                    <DictionaryCardForm
                        ai={{
                            available: true,
                            onAction: vi.fn().mockResolvedValue(undefined),
                            pending: false,
                            proposal: {
                                source: 'alarmer',
                                sourceResult: rebased
                                    ? { kind: 'unchanged' }
                                    : {
                                          kind: 'suggested',
                                          suggestionId: sourceId,
                                      },
                                sourceSuggestions: [
                                    {
                                        field: 'source',
                                        id: sourceId,
                                        value: "s'alarmer",
                                    },
                                ],
                                suggestions: [],
                            },
                        }}
                        card={startingCard}
                        dictionary={dictionary}
                        languages={languages}
                        onCancel={vi.fn()}
                        onSave={onSave}
                        pending={false}
                    />
                </>
            );
        }

        render(<RebasedProposal />);
        await user.click(
            within(screen.getByTestId('ai-review-source')).getByRole('button', {
                name: 'Accept Source suggestion',
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Rebase proposal' }),
        );
        expect(screen.queryByText(/Previous AI options/)).toBeNull();
        expect(
            screen.queryByText(/source phrase changed/i),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Source already looks correct.')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(expect.any(Object), [
            { field: 'source', suggestionId: sourceId },
        ]);
    });

    it('generates a single initial field and keeps Source unchanged feedback inline', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn().mockResolvedValue(undefined);
        const first = render(
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
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'medium',
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Generate Translation with AI',
            }),
        );
        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: { field: 'translation', kind: 'field' },
                successor: false,
            }),
        );
        first.unmount();

        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction,
                    pending: false,
                    proposal: {
                        source: 'medium',
                        sourceResult: { kind: 'unchanged' },
                        sourceSuggestions: [],
                        suggestions: [],
                    },
                }}
                card={{
                    ...card,
                    values: { ...card.values, source: 'medium' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );
        expect(screen.getByText('Source already looks correct.')).toBeVisible();
        expect(
            screen.getByRole('textbox', { name: /Source word or phrase/ }),
        ).toHaveValue('medium');
    });

    it.each([
        ['stale', 'another source', undefined],
        ['active', 'medium', authoringSuccessorJob],
    ] as const)(
        'keeps bulk acceptance disabled for a %s proposal while discard remains safe',
        async (_state, proposalSource, job) => {
            const user = userEvent.setup();
            render(
                <DictionaryCardForm
                    ai={{
                        available: true,
                        ...(job ? { job } : {}),
                        onAction: vi.fn().mockResolvedValue(undefined),
                        pending: false,
                        proposal: {
                            source: proposalSource,
                            suggestions: [
                                {
                                    field: 'translation',
                                    id: '42000000-0000-4000-8000-000000000001',
                                    value: 'medio',
                                },
                            ],
                        },
                    }}
                    {...(job
                        ? {
                              card: {
                                  ...card,
                                  values: {
                                      ...card.values,
                                      source: 'medium',
                                  },
                              },
                          }
                        : {})}
                    dictionary={dictionary}
                    languages={languages}
                    onCancel={vi.fn()}
                    onSave={vi.fn().mockResolvedValue(undefined)}
                    pending={false}
                />,
            );
            if (!job) {
                await user.type(
                    screen.getByLabelText(/Source word or phrase/),
                    'medium',
                );
            }

            if (_state === 'stale') {
                expect(
                    screen.queryByText('Choices: 1 · Fields: 1'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByTestId('ai-review-translation'),
                ).not.toBeInTheDocument();
            } else {
                expect(
                    screen.getByText('Choices: 1 · Fields: 1'),
                ).toBeInTheDocument();
                expect(
                    screen.getByRole('button', { name: 'Accept all' }),
                ).toBeDisabled();
                expect(
                    screen.getByRole('button', { name: 'Reject all' }),
                ).toBeEnabled();
            }
        },
    );

    it.each(['source', 'translation'] as const)(
        'accepts 200 astral code points and limits a 201st BMP character in %s',
        async (field) => {
            const user = userEvent.setup();
            const onSave = vi.fn().mockResolvedValue(undefined);
            render(
                <DictionaryCardForm
                    dictionary={dictionary}
                    languages={languages}
                    onCancel={vi.fn()}
                    onSave={onSave}
                    pending={false}
                />,
            );
            const source = screen.getByRole('textbox', {
                name: /Source word or phrase/,
            });
            const translation = screen.getByRole('textbox', {
                name: /^Translation/,
            });
            fireEvent.change(source, { target: { value: 'word' } });
            fireEvent.change(translation, { target: { value: 'translation' } });
            const input = field === 'source' ? source : translation;
            expect(input).toHaveAttribute('maxlength', '400');
            fireEvent.change(input, { target: { value: '😀'.repeat(200) } });
            expect(input).toHaveValue('😀'.repeat(200));
            await user.click(screen.getByRole('button', { name: 'Save card' }));
            expect(onSave).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    values: expect.objectContaining({
                        [field]: '😀'.repeat(200),
                    }),
                }),
                [],
            );
            fireEvent.change(input, { target: { value: 'x'.repeat(201) } });
            expect(input).toHaveValue('x'.repeat(200));
        },
    );

    it('keeps oversized existing text visible but blocks submit until corrected', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                card={{
                    ...card,
                    values: { ...card.values, translation: 'x'.repeat(201) },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        const translation = screen.getByRole('textbox', {
            name: /^Translation/,
        });
        expect(translation).toHaveValue('x'.repeat(201));
        expect(translation).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('Use at most 200 characters.')).toBeVisible();
        const save = screen.getByRole('button', { name: 'Save card' });
        expect(save).toBeDisabled();
        fireEvent.submit(save.closest('form')!);
        expect(onSave).not.toHaveBeenCalled();
        fireEvent.change(translation, { target: { value: 'corrected' } });
        await user.click(save);
        expect(onSave).toHaveBeenCalledOnce();
    });

    it('retains valid stored transcription beyond the prototype display limit', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        const transcription = '😀'.repeat(2000);
        render(
            <DictionaryCardForm
                card={{ ...card, values: { ...card.values, transcription } }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({ transcription }),
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
        const source = screen.getByLabelText(/Source word or phrase/);
        fireEvent.change(source, { target: { value: '😀'.repeat(200) } });
        expect(
            screen.getByRole('button', { name: 'Generate all' }),
        ).toBeEnabled();
        fireEvent.change(source, { target: { value: 'unsafe\u0085' } });
        expect(
            screen.getByRole('button', { name: 'Generate all' }),
        ).toBeDisabled();
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
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'manual',
        );
        expect(
            screen.getByText(/AI suggestions are unavailable/i),
        ).toBeVisible();
        await user.type(screen.getByLabelText(/^Translation \(/), 'manual');
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
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'active',
        );
        await user.type(screen.getByLabelText(/^Translation \(/), 'editable');
        await user.click(
            screen.getByRole('button', { name: 'Cancel generation' }),
        );
        expect(onAction).toHaveBeenCalledWith({ kind: 'cancel' });
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
            'editable',
        );
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
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'another',
        );
        expect(screen.getByText(/source phrase changed/i)).toBeInTheDocument();
        expect(
            screen.queryByTestId('ai-review-translation'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Generate all' }),
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
        expect(
            screen.queryByLabelText('Translate from'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('Locked')).toBeVisible();
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
        await user.click(
            screen.getByRole('switch', {
                name: 'Override dictionary settings for this card',
            }),
        );
        await user.click(screen.getByRole('switch', { name: 'Transcription' }));
        expect(
            screen.getByRole('textbox', { name: /^Transcription/ }),
        ).toBeVisible();
        expect(
            screen.queryByRole('switch', { name: 'Example translation' }),
        ).not.toBeInTheDocument();
    });

    it('preserves optional values when overriding is disabled and enabled again', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'stored',
        );
        await user.type(screen.getByLabelText(/^Translation/), 'guardado');
        await user.type(
            screen.getByRole('textbox', { name: /Context example/ }),
            'A retained example',
        );
        const override = screen.getByRole('switch', {
            name: 'Override dictionary settings for this card',
        });
        await user.click(override);
        await user.click(
            screen.getByRole('switch', { name: 'Context example' }),
        );
        expect(
            screen.queryByRole('textbox', { name: /Context example/ }),
        ).not.toBeInTheDocument();
        await user.click(override);
        expect(
            screen.getByRole('textbox', { name: /Context example/ }),
        ).toHaveValue('A retained example');
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    example: 'A retained example',
                }),
                overrides: expect.objectContaining({ exampleEnabled: null }),
            }),
            [],
        );
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
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            ' Medium ',
        );
        expect(screen.getByRole('status')).toHaveTextContent(
            'Different senses and contexts are allowed',
        );
        await user.type(
            screen.getByRole('textbox', { name: /Translation/ }),
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

        expect(screen.getByLabelText(/Source word or phrase/)).toHaveAttribute(
            'dir',
            'rtl',
        );
        expect(
            screen.getByRole('textbox', { name: /Translation/ }),
        ).toHaveAttribute('dir', 'ltr');

        expect(
            screen.getByRole('button', { name: 'Discard draft' }),
        ).toBeDisabled();
    });

    it('blocks saving and cancellation while an AI enqueue is pending', async () => {
        const user = userEvent.setup();
        const onCancel = vi.fn();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: true,
                    proposal: null,
                }}
                card={card}
                dictionary={dictionary}
                languages={languages}
                onCancel={onCancel}
                onSave={onSave}
                pending={false}
            />,
        );

        const cancel = screen.getByRole('button', { name: 'Cancel' });
        const save = screen.getByRole('button', { name: 'Save card' });
        expect(cancel).toBeDisabled();
        expect(save).toBeDisabled();
        await user.click(cancel);
        await user.click(save);
        expect(onCancel).not.toHaveBeenCalled();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('renders malicious card strings as inert text in responsive semantic DOM', async () => {
        const user = userEvent.setup();
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
        await user.click(
            screen.getByRole('button', { name: 'Card actions, card 1' }),
        );
        expect(
            screen.queryByRole('menuitem', { name: /Move earlier|Move later/ }),
        ).not.toBeInTheDocument();
    });

    it('deletes a selected archived card after explicit acknowledgement', async () => {
        const remove = vi
            .spyOn(dictionaryApi, 'deleteDictionaryCards')
            .mockResolvedValue({
                operationId: '30000000-0000-4000-8000-000000000002',
                targetKind: 'card',
                deletedCount: 1,
                resultingDictionaryVersion: 6,
            });
        const showModal = HTMLDialogElement.prototype.showModal;
        const close = HTMLDialogElement.prototype.close;
        HTMLDialogElement.prototype.showModal = function show() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function closeDialog() {
            this.removeAttribute('open');
        };
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={client}>
                <ArchivedCardDeletionHarness />
            </QueryClientProvider>,
        );

        await user.click(
            screen.getByRole('checkbox', {
                name: `Select card ${card.values.source}`,
            }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Delete selected' }),
        );
        const confirm = screen.getByRole('button', {
            name: 'Delete permanently',
        });
        expect(confirm).toBeDisabled();
        await user.click(
            screen.getByRole('checkbox', {
                name: 'I understand these cards cannot be recovered. Cards: 1.',
            }),
        );
        await user.click(confirm);

        await waitFor(() =>
            expect(remove).toHaveBeenCalledWith(
                'token',
                dictionary.id,
                {
                    expectedDictionaryVersion: 5,
                    scope: {
                        kind: 'selected',
                        targets: [{ cardId: card.id, expectedVersion: 3 }],
                    },
                },
                expect.any(String),
            ),
        );
        expect(
            await screen.findByText('Cards permanently deleted: 1.'),
        ).toBeInTheDocument();
        HTMLDialogElement.prototype.showModal = showModal;
        HTMLDialogElement.prototype.close = close;
    });

    it('hides archived-card bulk controls when no cards are loaded', () => {
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        render(
            <QueryClientProvider client={client}>
                <ArchivedCardDeletionHarness empty />
            </QueryClientProvider>,
        );

        expect(
            screen.queryByRole('checkbox', { name: 'Select loaded items' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Delete all archived' }),
        ).not.toBeInTheDocument();
        expect(screen.getByText('No cards here')).toBeInTheDocument();
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
