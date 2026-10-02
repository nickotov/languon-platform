import type {
    DictionaryCard,
    DictionaryCardAuthoringGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import {
    act,
    fireEvent,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
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
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { useCardDraft } from '@/fsd/features/dictionary-card-authoring/hooks/use-card-draft';
import { useAuthoringAutoSave } from '@/fsd/features/dictionary-card-authoring/hooks/use-authoring-auto-save';
import { applyAuthoringResult } from '@/fsd/features/dictionary-card-authoring/lib/apply-authoring-result';
import { createDraftVersion } from '@/fsd/features/dictionary-card-authoring/lib/card-draft-versions';

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
    translationContext: null,
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
    translationContext: null,
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

    it('uses v3 coherent dependency groups', () => {
        expect(
            isFieldAffectedByGeneration(
                'exampleTranslation',
                { kind: 'field', field: 'translation' },
                card.effectiveSettings,
                'card-authoring:v3',
            ),
        ).toBe(true);
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
    const [successor, setSuccessor] = useState(false);
    async function handleAction(
        action: Parameters<
            NonNullable<
                ComponentProps<typeof DictionaryCardForm>['ai']
            >['onAction']
        >[0],
    ) {
        onAction(action);
        if (action.kind === 'generate') setSuccessor(true);
    }
    return (
        <DictionaryCardForm
            ai={{
                available: true,
                format: 'card-authoring:v2',
                job: {
                    ...authoringReviewJob,
                    id: successor
                        ? authoringSuccessorJob.id
                        : authoringReviewJob.id,
                },
                onAction: handleAction,
                pending: false,
                proposal: successor
                    ? versionedSuccessorProposal
                    : versionedInitialProposal,
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

function renderGeneratedForm(
    proposal: NonNullable<
        NonNullable<ComponentProps<typeof DictionaryCardForm>['ai']>['proposal']
    >,
    options: Partial<ComponentProps<typeof DictionaryCardForm>> = {},
) {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onAction = vi.fn().mockResolvedValue(undefined);
    const props: ComponentProps<typeof DictionaryCardForm> = {
        ai: {
            available: true,
            format: 'card-authoring:v3',
            job: authoringReviewJob,
            onAction,
            pending: false,
            proposal: { translationContext: null, ...proposal },
        },
        card: { ...card, values: { ...card.values, source: proposal.source } },
        dictionary,
        languages,
        onCancel: vi.fn(),
        onSave,
        pending: false,
        ...options,
    };
    const view = render(<DictionaryCardForm {...props} />);
    function rerender(ui: Parameters<typeof view.rerender>[0]) {
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                {ui}
            </I18nProvider>,
        );
    }
    return {
        ...view,
        rerender,
        onSave,
        onAction,
        props,
    };
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
    it('saves optional dictionary translation context', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionarySettingsForm
                dictionary={dictionary}
                languages={languages}
                onSave={onSave}
                pending={false}
            />,
        );

        const context = screen.getByLabelText(/Dictionary context/);
        await user.type(context, 'Use the word in a museum-curation sense.');
        expect(context).toHaveAttribute('maxlength', '2000');
        await user.click(screen.getByRole('button', { name: 'Save settings' }));

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                translationContext: 'Use the word in a museum-curation sense.',
            }),
        );
    });

    it('validates dictionary context by Unicode code points', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionarySettingsForm
                dictionary={dictionary}
                languages={languages}
                onSave={onSave}
                pending={false}
            />,
        );

        const context = screen.getByLabelText(/Dictionary context/);
        fireEvent.change(context, { target: { value: '😀'.repeat(1000) } });
        await user.click(screen.getByRole('button', { name: 'Save settings' }));
        expect(onSave).toHaveBeenCalledOnce();

        fireEvent.change(context, { target: { value: 'a'.repeat(1001) } });
        expect(screen.getByText('Use at most 1000 characters.')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Save settings' }),
        ).toBeDisabled();
    });

    it('reveals an empty card override while retaining the inherited preview', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onAction = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    format: 'card-authoring:v3',
                    onAction,
                    pending: false,
                }}
                dictionary={{
                    ...dictionary,
                    translationContext: 'Museum curation terminology',
                }}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );

        expect(screen.getByText('Museum curation terminology')).toBeVisible();
        await user.click(
            screen.getByRole('switch', { name: /Update context/ }),
        );
        const context = screen.getByLabelText(/Card context/);
        expect(context).toHaveValue('');
        expect(context).toBeRequired();
        expect(screen.getByText(/Enter a context or turn off/)).toBeVisible();
        expect(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Generate all' }),
        ).toBeDisabled();

        await user.type(context, 'Photography as an artistic medium');
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'medium',
        );
        await user.type(screen.getByLabelText(/^Translation/), 'medio');
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                translationContext: 'Photography as an artistic medium',
            }),
            [],
        );
    });

    it('clears a card override to resume dictionary inheritance', async () => {
        const user = userEvent.setup();
        const onSave = vi.fn().mockResolvedValue(undefined);
        render(
            <DictionaryCardForm
                card={{
                    ...card,
                    translationContext: 'Photography terminology',
                }}
                dictionary={{
                    ...dictionary,
                    translationContext: 'Museum terminology',
                }}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );

        expect(screen.getByLabelText(/Card context/)).toHaveValue(
            'Photography terminology',
        );
        await user.click(
            screen.getByRole('switch', { name: /Update context/ }),
        );
        expect(screen.queryByLabelText(/Card context/)).not.toBeInTheDocument();
        expect(screen.getByText('Museum terminology')).toBeVisible();
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ translationContext: null }),
            [],
        );
    });

    it('invalidates v3 suggestions when translation context changes', async () => {
        const user = userEvent.setup();
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    format: 'card-authoring:v3',
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
                        translationContext: null,
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
            'medium',
        );
        await user.click(screen.getByRole('switch', { name: /Set context/ }));
        await user.type(
            screen.getByLabelText(/Card context/),
            'Photography terminology',
        );

        expect(
            screen.getByText(/source phrase or translation context changed/i),
        ).toBeVisible();
        expect(screen.queryByTestId('ai-review-translation')).toBeNull();
    });

    it('keeps v3 suggestions when local context differs only by outer whitespace', async () => {
        render(
            <DictionaryCardForm
                ai={{
                    available: true,
                    format: 'card-authoring:v3',
                    onAction: vi.fn().mockResolvedValue(undefined),
                    pending: false,
                    proposal: {
                        source: 'bank',
                        suggestions: [
                            {
                                field: 'translation',
                                id: '40000000-0000-4000-8000-000000000002',
                                value: 'banque',
                            },
                        ],
                        translationContext: 'Financial services',
                    },
                }}
                card={{
                    ...card,
                    translationContext: '  Financial services  ',
                    values: { ...card.values, source: 'bank' },
                }}
                dictionary={dictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={vi.fn().mockResolvedValue(undefined)}
                pending={false}
            />,
        );

        await waitFor(() =>
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                'banque',
            ),
        );
        expect(
            screen.queryByText(/source phrase or translation context changed/i),
        ).toBeNull();
    });

    it('renders v2 dependency progress while keeping v1 field-local', async () => {
        const user = userEvent.setup();
        const { unmount } = render(
            <GeneratingFieldHarness format='card-authoring:v2' />,
        );

        await user.click(
            screen.getByRole('button', {
                name: /^(Generate Translation with AI|Regenerate Translation)$/,
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
                name: /^(Generate Translation with AI|Regenerate Translation)$/,
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
            <VersionedAuthoringHarness onAction={onAction} onSave={onSave} />,
        );
        await screen.findByText('Version 2 of 2');
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'The room is medium-sized.',
        );
        await user.click(
            screen.getByRole('button', {
                name: 'Regenerate Context example',
            }),
        );
        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: { field: 'example', kind: 'field' },
                successor: true,
            }),
        );
        await screen.findByText('Version 3 of 3');
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'They chose a medium suitcase.',
        );
        expect(screen.getByLabelText(/^Example translation \(/)).toHaveValue(
            'Eligieron una maleta mediana.',
        );
        await user.click(
            screen.getByRole('button', { name: 'Previous form version' }),
        );
        expect(screen.getByText('Version 2 of 3')).toBeVisible();
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'The room is medium-sized.',
        );
        expect(onSave).not.toHaveBeenCalled();
        expect(
            screen.getByRole('button', {
                name: 'Regenerate Context example',
            }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
        expect(onSave).toHaveBeenLastCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    example: 'The room is medium-sized.',
                    exampleTranslation: 'La habitación es mediana.',
                }),
            }),
            [],
        );
        await user.click(
            screen.getByRole('button', { name: 'Next form version' }),
        );
        expect(screen.getByText('Version 3 of 3')).toBeVisible();
        expect(
            screen.getByRole('button', { name: 'Next form version' }),
        ).toBeDisabled();
    });

    it('creates version 2 for the first AI generation on a saved card', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn();
        const sourceSuggestionId = '49000000-0000-4000-8000-000000000001';

        function SavedCardGenerationHarness() {
            const [proposal, setProposal] = useState<NonNullable<
                NonNullable<
                    ComponentProps<typeof DictionaryCardForm>['ai']
                >['proposal']
            > | null>(null);

            async function handleAction(
                action: Parameters<
                    NonNullable<
                        ComponentProps<typeof DictionaryCardForm>['ai']
                    >['onAction']
                >[0],
            ) {
                onAction(action);
                if (action.kind === 'generate')
                    setProposal({
                        source: 'but',
                        sourceResult: {
                            kind: 'suggested',
                            suggestionId: sourceSuggestionId,
                        },
                        sourceSuggestions: [
                            {
                                field: 'source',
                                id: sourceSuggestionId,
                                value: 'le but',
                            },
                        ],
                        suggestions: [],
                        translationContext: null,
                    });
            }

            return (
                <DictionaryCardForm
                    ai={{
                        available: true,
                        format: 'card-authoring:v3',
                        job: proposal ? authoringReviewJob : null,
                        onAction: handleAction,
                        pending: false,
                        proposal,
                    }}
                    card={{
                        ...card,
                        values: { ...card.values, source: 'but' },
                    }}
                    dictionary={dictionary}
                    languages={languages}
                    onCancel={vi.fn()}
                    onSave={vi.fn().mockResolvedValue(undefined)}
                    pending={false}
                />
            );
        }

        render(<SavedCardGenerationHarness />);
        expect(screen.queryByText(/Version 1 of/)).not.toBeInTheDocument();

        await user.click(
            screen.getByRole('button', { name: 'Regenerate Source' }),
        );

        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: { field: 'source', kind: 'field' },
                successor: false,
            }),
        );
        expect(await screen.findByText('Version 2 of 2')).toBeVisible();
        expect(screen.getByLabelText(/Source word or phrase/)).toHaveValue(
            'le but',
        );

        await user.click(
            screen.getByRole('button', { name: 'Previous form version' }),
        );
        expect(screen.getByText('Version 1 of 2')).toBeVisible();
        expect(
            screen.getByRole('textbox', { name: /Source word or phrase/ }),
        ).toHaveValue('but');
        expect(screen.queryByTestId('ai-review-source')).toBeNull();
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
                    translation: 'manual translation',
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
            expect(screen.getByLabelText(/Translation \(/)).toBeDisabled();
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
                name: 'Regenerate all fields',
            });
            expect(generate).toBeEnabled();
            expect(screen.queryByText('medio')).not.toBeInTheDocument();
            await user.click(
                screen.getByRole('button', { name: /^(Save|Create) card$/ }),
            );
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

    it('applies the latest choice and exposes only whole-form history', async () => {
        const { onAction } = renderGeneratedForm({
            source: 'medium',
            suggestions: Array.from({ length: 3 }, (_, index) => ({
                field: 'translation',
                id: `choice-${index}`,
                value: `translation choice ${index + 1}`,
            })),
        });
        await waitFor(() =>
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                'translation choice 3',
            ),
        );
        expect(screen.queryByText(/Previous AI options/)).toBeNull();
        expect(
            screen.queryByRole('button', { name: /Accept|Reject/ }),
        ).toBeNull();
        await userEvent.setup().click(
            screen.getByRole('button', {
                name: 'Regenerate Translation',
            }),
        );
        expect(onAction).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: { kind: 'field', field: 'translation' },
            }),
        );
    });

    it('blocks editing, Save, navigation and AI while a successor runs', async () => {
        renderGeneratedForm(authoringProposal, {
            ai: {
                available: true,
                job: authoringSuccessorJob,
                onAction: vi.fn().mockResolvedValue(undefined),
                pending: false,
                proposal: authoringProposal,
                successorActive: true,
            },
        });
        expect(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        ).toBeDisabled();
        expect(
            screen.getByRole('textbox', { name: /Source word or phrase/ }),
        ).toBeDisabled();
        expect(
            screen.queryByRole('button', { name: /Accept|Reject/ }),
        ).toBeNull();
        expect(
            screen.getByRole('button', {
                name: 'Regenerate Translation',
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

    it('generates from Source only and fills the latest translation without explicit acceptance', async () => {
        const user = userEvent.setup();
        const onAction = vi.fn().mockResolvedValue(undefined);
        const onSave = vi.fn().mockResolvedValue(undefined);
        const props = {
            dictionary,
            languages,
            onCancel: vi.fn(),
            onSave,
            pending: false,
        };
        const form = render(
            <DictionaryCardForm
                {...props}
                ai={{
                    available: true,
                    onAction,
                    pending: false,
                    proposal: null,
                }}
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
        form.rerender(
            <I18nProvider locale='en' messages={en}>
                <DictionaryCardForm
                    {...props}
                    ai={{
                        available: true,
                        onAction,
                        pending: false,
                        format: 'card-authoring:v3',
                        job: authoringReviewJob,
                        proposal: {
                            ...authoringProposal,
                            translationContext: null,
                        },
                    }}
                />
            </I18nProvider>,
        );
        await waitFor(() =>
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                'medio',
            ),
        );
        expect(screen.queryByText(/Version 2 of/)).toBeNull();
        expect(onSave).not.toHaveBeenCalled();
        expect(
            screen.queryByRole('button', { name: /Accept|Reject/ }),
        ).toBeNull();
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({ translation: 'medio' }),
            }),
            [
                {
                    field: 'translation',
                    suggestionId: authoringProposal.suggestions[0]!.id,
                },
            ],
            { jobId: authoringReviewJob.id, format: 'card-authoring:v3' },
        );
        await user.clear(screen.getByLabelText(/^Translation \(/));
        await user.type(
            screen.getByLabelText(/^Translation \(/),
            'manual translation',
        );
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
        expect(onSave.mock.calls.at(-1)![1]).toEqual([]);
    });

    it('fills latest enabled suggestions while preserving disabled stored content', async () => {
        const { onSave } = renderGeneratedForm({
            source: 'medium',
            suggestions: [
                { field: 'translation', id: 'translation-old', value: 'medio' },
                {
                    field: 'translation',
                    id: 'translation-new',
                    value: 'entorno',
                },
                {
                    field: 'example',
                    id: 'example-new',
                    value: 'A second example.',
                },
                {
                    field: 'exampleTranslation',
                    id: 'example-translation-new',
                    value: 'Un segundo ejemplo.',
                },
                {
                    field: 'definition',
                    id: 'disabled',
                    value: 'Disabled suggestion',
                },
            ],
        });
        await waitFor(() =>
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                'entorno',
            ),
        );
        expect(screen.getByLabelText(/^Context example \(/)).toHaveValue(
            'A second example.',
        );
        expect(screen.getByLabelText(/^Example translation \(/)).toHaveValue(
            'Un segundo ejemplo.',
        );
        await userEvent
            .setup()
            .click(
                screen.getByRole('button', { name: /^(Save|Create) card$/ }),
            );
        expect(onSave.mock.calls[0]![0].values.definition).toBe(
            card.values.definition,
        );
        expect(onSave.mock.calls[0]![1]).toEqual([
            { field: 'translation', suggestionId: 'translation-new' },
            { field: 'example', suggestionId: 'example-new' },
            {
                field: 'exampleTranslation',
                suggestionId: 'example-translation-new',
            },
        ]);
    });

    it('applies normalized Source and compatible dependent results atomically with provenance', async () => {
        const sourceId = '44000000-0000-4000-8000-000000000001';
        const translationId = '44000000-0000-4000-8000-000000000002';
        const { onSave } = renderGeneratedForm({
            source: 'alarmer',
            sourceResult: { kind: 'suggested', suggestionId: sourceId },
            sourceSuggestions: [
                { field: 'source', id: sourceId, value: "s'alarmer" },
            ],
            suggestions: [
                {
                    basisSource: "s'alarmer",
                    field: 'translation',
                    id: translationId,
                    value: 'to become alarmed',
                },
            ],
        });
        await waitFor(() =>
            expect(screen.getByLabelText(/Source word or phrase/)).toHaveValue(
                "s'alarmer",
            ),
        );
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
            'to become alarmed',
        );
        expect(screen.queryByText('Review Source first')).toBeNull();
        expect(screen.queryByTestId('ai-review-source')).toBeNull();
        await userEvent
            .setup()
            .click(
                screen.getByRole('button', { name: /^(Save|Create) card$/ }),
            );
        expect(onSave.mock.calls[0]![1]).toEqual([
            { field: 'source', suggestionId: sourceId },
            { field: 'translation', suggestionId: translationId },
        ]);
    });

    it('clears Source and dependent provenance after a manual Source edit', async () => {
        const sourceId = '45000000-0000-4000-8000-000000000001';
        const { onSave } = renderGeneratedForm({
            source: 'alarmer',
            sourceResult: { kind: 'suggested', suggestionId: sourceId },
            sourceSuggestions: [
                { field: 'source', id: sourceId, value: "s'alarmer" },
            ],
            suggestions: [
                {
                    basisSource: "s'alarmer",
                    field: 'translation',
                    id: 'dependent',
                    value: 'to become alarmed',
                },
            ],
        });
        await waitFor(() =>
            expect(screen.getByLabelText(/Source word or phrase/)).toHaveValue(
                "s'alarmer",
            ),
        );
        const user = userEvent.setup();
        await user.type(
            screen.getByRole('textbox', { name: /Source word or phrase/ }),
            ' manually changed',
        );
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
        expect(onSave.mock.calls[0]![1]).toEqual([]);
    });

    it('does not reapply a completed job when polling returns a different proposal object', async () => {
        const form = renderGeneratedForm(authoringProposal);
        await waitFor(() =>
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                'medio',
            ),
        );
        await userEvent
            .setup()
            .type(screen.getByLabelText(/^Translation \(/), ' manual');
        form.rerender(
            <DictionaryCardForm
                {...form.props}
                ai={{
                    ...form.props.ai!,
                    proposal: {
                        ...authoringProposal,
                        translationContext: null,
                    },
                }}
            />,
        );
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
            'medio manual',
        );
        expect(screen.getByText('Version 2 of 2')).toBeVisible();
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
                name: /^(Generate Translation with AI|Regenerate Translation)$/,
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

    it.each(['stale', 'active'] as const)(
        'does not apply a %s proposal or expose review controls',
        async (state) => {
            renderGeneratedForm(
                {
                    source: state === 'stale' ? 'another source' : 'medium',
                    suggestions: authoringProposal.suggestions,
                },
                {
                    card: {
                        ...card,
                        values: { ...card.values, source: 'medium' },
                    },
                    ai: {
                        available: true,
                        job:
                            state === 'active'
                                ? authoringSuccessorJob
                                : authoringReviewJob,
                        onAction: vi.fn().mockResolvedValue(undefined),
                        pending: false,
                        proposal: {
                            source:
                                state === 'stale' ? 'another source' : 'medium',
                            suggestions: authoringProposal.suggestions,
                        },
                    },
                },
            );
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                card.values.translation,
            );
            expect(
                screen.queryByRole('button', { name: /Accept|Reject/ }),
            ).toBeNull();
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
            await user.click(
                screen.getByRole('button', { name: /^(Save|Create) card$/ }),
            );
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
        const save = screen.getByRole('button', {
            name: /^(Save|Create) card$/,
        });
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
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
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
        expect(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        ).toBeEnabled();
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
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue('');
    });

    it('invalidates generated provenance after the source changes and allows regeneration', async () => {
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
        expect(
            screen.getByText(/source phrase or translation context changed/i),
        ).toBeInTheDocument();
        expect(
            screen.queryByTestId('ai-review-translation'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Regenerate all fields' }),
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
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
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
        await user.click(
            screen.getByRole('button', { name: /^(Save|Create) card$/ }),
        );
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

        const cancel = screen.getByRole('button', {
            name: /^(Cancel|Close|Discard draft)$/,
        });
        const save = screen.getByRole('button', {
            name: /^(Save|Create) card$/,
        });
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

    it('keeps a lone enabled example editable without dropping dormant translation', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const exampleOnlyDictionary = {
            ...dictionary,
            settings: {
                ...dictionary.settings,
                values: {
                    ...dictionary.settings.values,
                    exampleTranslationEnabled: false,
                },
            },
        };
        render(
            <DictionaryCardForm
                card={card}
                dictionary={exampleOnlyDictionary}
                languages={languages}
                onCancel={vi.fn()}
                onSave={onSave}
                pending={false}
            />,
        );
        expect(screen.queryByLabelText(/^Example translation \(/)).toBeNull();
        const user = userEvent.setup();
        const example = screen.getByLabelText(/^Context example \(/);
        await user.clear(example);
        await user.type(example, 'A revised example.');
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave.mock.calls[0]![0].values).toMatchObject({
            example: 'A revised example.',
            exampleTranslation: card.values.exampleTranslation,
        });
    });

    it.each(['example', 'exampleTranslation'] as const)(
        'renders a lone populated %s with its own language and label',
        (field) => {
            const other =
                field === 'example' ? 'exampleTranslation' : 'example';
            render(
                <DictionaryCardList
                    cards={[
                        { ...card, values: { ...card.values, [other]: null } },
                    ]}
                    dictionary={dictionary}
                    languages={languages}
                    lifecycle='active'
                    onEdit={vi.fn()}
                    onLifecycle={vi.fn()}
                    onMove={vi.fn()}
                    pending={false}
                />,
            );
            expect(screen.getByText(card.values[field]!)).toHaveAttribute(
                'lang',
                field === 'example' ? 'en' : 'es',
            );
            expect(screen.queryByText(card.values[other]!)).toBeNull();
            expect(screen.getByText(card.values[field]!)).toHaveAttribute(
                'dir',
                'ltr',
            );
        },
    );

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

describe('auto-accepted card generation regression state', () => {
    const startingCard = {
        ...card,
        values: { ...card.values, source: 'medium' },
    };
    const proposal = { ...authoringProposal, translationContext: null };
    function propsFor(
        options: Partial<ComponentProps<typeof DictionaryCardForm>> = {},
    ): ComponentProps<typeof DictionaryCardForm> {
        return {
            dictionary,
            languages,
            card: startingCard,
            pending: false,
            onSave: vi.fn().mockResolvedValue(undefined),
            onCancel: vi.fn(),
            ai: {
                available: true,
                format: 'card-authoring:v3',
                onAction: vi.fn().mockResolvedValue(undefined),
                pending: false,
                job: authoringReviewJob,
                proposal,
                proposalJobId: authoringReviewJob.id,
            },
            ...options,
        };
    }
    function useDraftAndSave(props: ComponentProps<typeof DictionaryCardForm>) {
        const draft = useCardDraft(props);
        return { ...draft, ...useAuthoringAutoSave(props, draft) };
    }

    it('preserves Source-only new-card history after editing Source and starting a fresh job', async () => {
        const initial = propsFor({
            card: undefined,
            ai: { ...propsFor().ai!, job: null, proposal: null },
        });
        const hook = renderHook(useCardDraft, { initialProps: initial });
        act(() => hook.result.current.setValue('source', 'medium'));
        const firstAI = {
            ...propsFor().ai!,
            proposal: {
                source: 'medium',
                sourceResult: { kind: 'unchanged' as const },
                suggestions: [],
                translationContext: null,
            },
        };
        hook.rerender({ ...initial, ai: firstAI });
        await waitFor(() =>
            expect(hook.result.current.activeVersion.generation?.jobId).toBe(
                authoringReviewJob.id,
            ),
        );
        expect(hook.result.current.versionCount).toBe(1);
        act(() => hook.result.current.setValue('source', 'changed source'));
        hook.rerender({
            ...initial,
            ai: {
                ...firstAI,
                job: { ...authoringReviewJob, id: authoringSuccessorJob.id },
                proposalJobId: authoringSuccessorJob.id,
                proposal: { ...firstAI.proposal, source: 'changed source' },
            },
        });
        await waitFor(() => expect(hook.result.current.versionCount).toBe(2));
        expect(hook.result.current.activeVersionIndex).toBe(1);
        act(() => hook.result.current.setActiveVersion(0));
        expect(hook.result.current.activeVersion.generation?.jobId).toBe(
            authoringReviewJob.id,
        );
        expect(hook.result.current.draft.values.translation).toBe('');
    });

    it('reports unchanged when autosave returns an explicit no-op outcome', async () => {
        const onAutoSave = vi.fn().mockResolvedValue({
            card: startingCard,
            dictionaryVersion: 1,
            unchanged: true,
        });
        const initial = propsFor({
            onAutoSave,
            ai: {
                ...propsFor().ai!,
                proposal: {
                    source: 'medium',
                    sourceResult: { kind: 'unchanged' },
                    suggestions: [],
                    translationContext: null,
                },
            },
        });
        const hook = renderHook(useDraftAndSave, { initialProps: initial });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('unchanged'),
        );
        expect(onAutoSave).toHaveBeenCalledOnce();
        expect(hook.result.current.autoSaveLocked).toBe(false);
        expect(hook.result.current.dirty).toBe(false);
        act(() =>
            hook.result.current.setValue('translation', 'new manual edit'),
        );
        expect(hook.result.current.dirty).toBe(true);
        expect(hook.result.current.autoSaveStatus).toBe('idle');
        expect(onAutoSave).toHaveBeenCalledOnce();
    });

    it('preserves remaining AI provenance when explicitly saving a corrected invalid latest form', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const onAutoSave = vi.fn();
        const initial = propsFor({
            onSave,
            onAutoSave,
            ai: {
                ...propsFor().ai!,
                proposal: {
                    source: 'medium',
                    translationContext: null,
                    suggestions: [
                        {
                            field: 'translation',
                            id: 'invalid-translation',
                            value: 'x'.repeat(201),
                        },
                        {
                            field: 'example',
                            id: 'valid-example',
                            value: 'AI example stays',
                        },
                    ],
                },
            },
        });
        render(<DictionaryCardForm {...initial} />);
        await waitFor(() =>
            expect(screen.getByLabelText(/^Translation \(/)).toHaveValue(
                'x'.repeat(201),
            ),
        );
        expect(onAutoSave).not.toHaveBeenCalled();
        const user = userEvent.setup();
        await user.clear(screen.getByLabelText(/^Translation \(/));
        await user.type(
            screen.getByLabelText(/^Translation \(/),
            'corrected translation',
        );
        await user.click(screen.getByRole('button', { name: 'Save card' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    translation: 'corrected translation',
                    example: 'AI example stays',
                }),
            }),
            [{ field: 'example', suggestionId: 'valid-example' }],
            { jobId: authoringReviewJob.id, format: 'card-authoring:v3' },
        );
    });

    it('uses fresh saved-card revisions for consecutive auto-saves without resetting history', async () => {
        let cardVersion = 1;
        const onAutoSave = vi.fn().mockImplementation(async (draft) => ({
            card: {
                ...startingCard,
                values: draft.values,
                version: ++cardVersion,
            },
            dictionaryVersion: cardVersion,
        }));
        const initial = propsFor({ onAutoSave });
        const hook = renderHook(useDraftAndSave, { initialProps: initial });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('saved'),
        );
        hook.rerender({
            ...initial,
            card: {
                ...startingCard,
                values: { ...startingCard.values, translation: 'medio' },
                version: 2,
            },
            ai: {
                ...initial.ai!,
                job: { ...authoringReviewJob, id: authoringSuccessorJob.id },
                proposalJobId: authoringSuccessorJob.id,
                proposal: {
                    ...proposal,
                    suggestions: [
                        {
                            ...proposal.suggestions[0]!,
                            id: 'new-choice',
                            value: 'medio',
                        },
                    ],
                },
            },
        });
        await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('saved'),
        );
        expect(hook.result.current.versionCount).toBe(3);
        expect(onAutoSave.mock.calls[1]![2]).toEqual({
            jobId: authoringSuccessorJob.id,
            format: 'card-authoring:v3',
        });
        expect(onAutoSave.mock.calls[1]![1]).toEqual([
            { field: 'translation', suggestionId: 'new-choice' },
        ]);
        expect(hook.result.current.dirty).toBe(false);
    });

    it('keeps unsaved new-card history and Create uses the displayed snapshot generation', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const initial = propsFor({
            card: undefined,
            onSave,
            ai: { ...propsFor().ai!, job: null, proposal: null },
        });
        const view = render(<DictionaryCardForm {...initial} />);
        const user = userEvent.setup();
        await user.type(
            screen.getByLabelText(/Source word or phrase/),
            'medium',
        );
        await user.type(
            screen.getByLabelText(/^Translation \(/),
            'prior translation',
        );
        function update(ai: ComponentProps<typeof DictionaryCardForm>['ai']) {
            view.rerender(
                <I18nProvider locale='en' messages={en}>
                    <DictionaryCardForm {...initial} ai={ai} />
                </I18nProvider>,
            );
        }
        update(propsFor().ai);
        await screen.findByText('Version 2 of 2');
        update({
            ...propsFor().ai!,
            job: { ...authoringReviewJob, id: authoringSuccessorJob.id },
            proposalJobId: authoringSuccessorJob.id,
            proposal: {
                ...proposal,
                suggestions: [
                    {
                        field: 'translation',
                        id: 'second-choice',
                        value: 'second result',
                    },
                ],
            },
        });
        await screen.findByText('Version 3 of 3');
        expect(onSave).not.toHaveBeenCalled();
        await user.click(
            screen.getByRole('button', { name: 'Previous form version' }),
        );
        expect(screen.getByLabelText(/^Translation \(/)).toHaveValue('medio');
        await user.click(screen.getByRole('button', { name: 'Create card' }));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({ translation: 'medio' }),
            }),
            [
                {
                    field: 'translation',
                    suggestionId: proposal.suggestions[0]!.id,
                },
            ],
            { jobId: authoringReviewJob.id, format: 'card-authoring:v3' },
        );
    });

    it.each([
        ['Source alone', null, null, 1],
        ['whitespace Translation', '  ', null, 1],
        ['Translation', 'manual', null, 2],
        ['disabled Definition', null, 'manual definition', 2],
    ] as const)(
        'preserves the first new version only for substantive content: %s',
        async (_name, translation, definition, count) => {
            const initial = propsFor({
                card: undefined,
                ai: { ...propsFor().ai!, job: null, proposal: null },
            });
            const hook = renderHook(useCardDraft, { initialProps: initial });
            act(() => {
                hook.result.current.setValue('source', 'medium');
                if (translation !== null)
                    hook.result.current.setValue('translation', translation);
                if (definition !== null)
                    hook.result.current.setValue('definition', definition);
            });
            hook.rerender({ ...initial, ai: propsFor().ai });
            await waitFor(() =>
                expect(hook.result.current.draft.values.translation).toBe(
                    'medio',
                ),
            );
            expect(hook.result.current.versionCount).toBe(count);
        },
    );

    it('does not append versions for failed or cancelled jobs and ignores old retained proposals', async () => {
        const initial = propsFor();
        const hook = renderHook(useCardDraft, { initialProps: initial });
        await waitFor(() => expect(hook.result.current.versionCount).toBe(2));
        for (const state of [
            'running',
            'failed',
            'cancelled',
            'review',
        ] as const) {
            hook.rerender({
                ...initial,
                ai: {
                    ...initial.ai!,
                    job: {
                        ...authoringReviewJob,
                        id: authoringSuccessorJob.id,
                        state,
                    },
                    proposalJobId: authoringReviewJob.id,
                },
            });
            expect(hook.result.current.versionCount).toBe(2);
        }
        hook.rerender({
            ...initial,
            ai: {
                ...initial.ai!,
                job: { ...authoringReviewJob, id: authoringSuccessorJob.id },
                proposalJobId: authoringSuccessorJob.id,
            },
        });
        await waitFor(() => expect(hook.result.current.versionCount).toBe(3));
    });

    it('applies only fresh compatible choices and preserves unaffected manual fields and context', () => {
        const initial = createDraftVersion(
            { ...startingCard, translationContext: 'manual context' },
            {
                source: 'medium',
                suggestions: [
                    { field: 'example', id: 'old', value: 'old example' },
                ],
            },
        );
        initial.draft.values.example = 'manually edited example';
        const applied = applyAuthoringResult(
            initial,
            {
                source: 'medium',
                sourceResult: { kind: 'suggested', suggestionId: 'source' },
                sourceSuggestions: [
                    { field: 'source', id: 'source', value: 'a medium' },
                ],
                suggestions: [
                    { field: 'example', id: 'old', value: 'old example' },
                    {
                        field: 'translation',
                        id: 'incompatible',
                        basisSource: 'medium',
                        value: 'wrong basis',
                    },
                    {
                        field: 'translation',
                        id: 'translation',
                        basisSource: 'a medium',
                        value: 'un medio',
                    },
                    {
                        field: 'definition',
                        id: 'disabled',
                        value: 'disabled replacement',
                    },
                ],
            },
            card.effectiveSettings,
            { jobId: authoringReviewJob.id, format: 'card-authoring:v3' },
        );
        expect(applied.draft.values).toEqual({
            ...initial.draft.values,
            source: 'a medium',
            translation: 'un medio',
        });
        expect(applied.draft.translationContext).toBe('manual context');
        expect(applied.selectedSuggestions).toEqual({
            source: 'source',
            translation: 'translation',
        });
        expect(initial.draft.values.source).toBe('medium');
    });

    it('auto-saves the full form and preserves local history after canonical version refresh', async () => {
        const onAutoSave = vi.fn().mockImplementation(async (draft) => ({
            card: { ...startingCard, values: draft.values, version: 2 },
            dictionaryVersion: 2,
        }));
        const initial = propsFor({
            onAutoSave,
            ai: { ...propsFor().ai!, job: null, proposal: null },
        });
        const hook = renderHook(useDraftAndSave, { initialProps: initial });
        act(() =>
            hook.result.current.setValue('example', 'prior manual draft'),
        );
        hook.rerender({ ...initial, ai: propsFor().ai });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('saved'),
        );
        expect(onAutoSave).toHaveBeenCalledOnce();
        expect(onAutoSave).toHaveBeenCalledWith(
            expect.objectContaining({
                values: expect.objectContaining({
                    translation: 'medio',
                    example: 'prior manual draft',
                }),
            }),
            [
                {
                    field: 'translation',
                    suggestionId: authoringProposal.suggestions[0]!.id,
                },
            ],
            { jobId: authoringReviewJob.id, format: 'card-authoring:v3' },
        );
        hook.rerender({
            ...initial,
            ai: propsFor().ai,
            card: {
                ...startingCard,
                values: {
                    ...startingCard.values,
                    translation: 'medio',
                    example: 'prior manual draft',
                },
                version: 2,
            },
        });
        expect(hook.result.current.versionCount).toBe(2);
        expect(hook.result.current.dirty).toBe(false);
        act(() => hook.result.current.setActiveVersion(0));
        expect(hook.result.current.dirty).toBe(true);
        expect(onAutoSave).toHaveBeenCalledOnce();
    });

    it('freezes an ambiguous autosave candidate and retries precisely the same provenance and payload', async () => {
        const onAutoSave = vi
            .fn()
            .mockRejectedValueOnce(
                Object.assign(new Error('ambiguous'), { freezeDraft: true }),
            )
            .mockImplementationOnce(async (draft) => ({
                card: { ...startingCard, values: draft.values, version: 2 },
                dictionaryVersion: 2,
            }));
        const hook = renderHook(useDraftAndSave, {
            initialProps: propsFor({ onAutoSave }),
        });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('failed'),
        );
        expect(hook.result.current.autoSaveLocked).toBe(true);
        act(() => hook.result.current.retryAutoSave());
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('saved'),
        );
        expect(onAutoSave.mock.calls[1]).toEqual(onAutoSave.mock.calls[0]);
        expect(hook.result.current.autoSaveLocked).toBe(false);
    });

    it('reports saved-but-refresh-failed distinctly and keeps the retry candidate stable', async () => {
        const onAutoSave = vi.fn().mockRejectedValue(
            Object.assign(new Error('refresh unavailable'), {
                saved: true,
                freezeDraft: true,
            }),
        );
        const hook = renderHook(useDraftAndSave, {
            initialProps: propsFor({ onAutoSave }),
        });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('refreshFailed'),
        );
        expect(hook.result.current.autoSaveLocked).toBe(true);
        act(() => hook.result.current.retryAutoSave());
        await waitFor(() => expect(onAutoSave).toHaveBeenCalledTimes(2));
        expect(onAutoSave.mock.calls[1]).toEqual(onAutoSave.mock.calls[0]);
    });

    it('freezes accepted-candidate refresh conflicts and requires reload instead of resubmitting', async () => {
        const onAutoSave = vi.fn().mockRejectedValue(
            Object.assign(
                new Error('accepted version changed before refresh'),
                {
                    saved: true,
                    freezeDraft: true,
                    reloadRequired: true,
                },
            ),
        );
        const hook = renderHook(useDraftAndSave, {
            initialProps: propsFor({ onAutoSave }),
        });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('conflict'),
        );
        expect(hook.result.current.autoSaveLocked).toBe(true);
        expect(hook.result.current.draft.values.translation).toBe('medio');
        act(() => hook.result.current.retryAutoSave());
        expect(onAutoSave).toHaveBeenCalledOnce();
        expect(hook.result.current.autoSaveStatus).toBe('conflict');
        expect(hook.result.current.autoSaveLocked).toBe(true);
    });

    it('retains an invalid generated form for explicit correction without attempting persistence', async () => {
        const onAutoSave = vi.fn();
        const initial = propsFor({ onAutoSave });
        const hook = renderHook(useDraftAndSave, {
            initialProps: {
                ...initial,
                ai: {
                    ...initial.ai!,
                    proposal: {
                        source: 'medium',
                        translationContext: null,
                        suggestions: [
                            {
                                field: 'translation',
                                id: 'invalid',
                                value: 'x'.repeat(201),
                            },
                        ],
                    },
                },
            },
        });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('invalid'),
        );
        expect(onAutoSave).not.toHaveBeenCalled();
        expect(hook.result.current.draft.values.translation).toHaveLength(201);
        expect(hook.result.current.autoSaveLocked).toBe(false);
    });

    it('does not mark a new editor session saved from a late previous-card completion', async () => {
        let finish!: (response: {
            card: DictionaryCard;
            dictionaryVersion: number;
        }) => void;
        const onAutoSave = vi.fn().mockImplementation(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        const initial = propsFor({ onAutoSave });
        const hook = renderHook(useDraftAndSave, { initialProps: initial });
        await waitFor(() =>
            expect(hook.result.current.autoSaveStatus).toBe('saving'),
        );
        hook.rerender({
            ...initial,
            card: {
                ...startingCard,
                id: 'different-card',
                values: { ...startingCard.values, source: 'different' },
            },
            ai: { ...initial.ai!, job: null, proposal: null },
        });
        await act(async () =>
            finish({
                card: {
                    ...startingCard,
                    values: { ...startingCard.values, translation: 'medio' },
                    version: 2,
                },
                dictionaryVersion: 2,
            }),
        );
        expect(hook.result.current.autoSaveStatus).toBe('idle');
        expect(hook.result.current.draft.values.source).toBe('different');
        expect(hook.result.current.versionCount).toBe(1);
    });
});
