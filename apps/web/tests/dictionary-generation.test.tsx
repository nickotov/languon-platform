import type {
    DictionaryCard,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, vi } from 'vitest';

import {
    DictionaryGenerationPanel,
    isGenerationJobStale,
} from '@/fsd/features/dictionary-generation';

import { render } from './render';

const languages = [
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
        direction: 'rtl',
        displayNames: {
            en: 'Arabic',
            es: 'Árabe',
            fr: 'Arabe',
            ru: 'Арабский',
        },
        tag: 'ar',
    },
] as LanguageCatalogEntry[];

const settings = {
    definitionEnabled: true,
    definitionLanguage: 'source',
    exampleEnabled: true,
    exampleLanguage: 'source',
    exampleTranslationEnabled: true,
    transcriptionCustomLabel: null,
    transcriptionEnabled: true,
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
    activeCardCount: 1,
    archivedAt: null,
    createdAt: '2026-08-21T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'English and Arabic',
    settings: {
        updatedAt: '2026-08-21T10:00:00.000Z',
        values: settings,
        version: 2,
    },
    settingsVersion: 2,
    sourceDictionaryId: null,
    sourceLanguage: 'en',
    targetLanguage: 'ar',
    updatedAt: '2026-08-21T10:00:00.000Z',
    version: 3,
    visibility: 'private',
} satisfies OwnedDictionary;
const originalValues = {
    definition: '<img src=x onerror=alert(1)>',
    example: 'The curator draws a distinction.',
    exampleTranslation: 'يميّز القيّم بين الفترتين.',
    source: '<script>alert(1)</script>',
    transcription: 'dɪˈstɪŋkʃən',
    translation: 'تمييز',
};
const card = {
    archivedAt: null,
    authorship: 'human',
    createdAt: '2026-08-21T10:00:00.000Z',
    dictionaryId: dictionary.id,
    effectiveSettings: {
        ...settings,
        exampleTranslationLanguage: 'target',
    },
    id: '20000000-0000-4000-8000-000000000001',
    lifecycle: 'active',
    overrides,
    position: '1000',
    settingsVersion: 2,
    updatedAt: '2026-08-21T10:00:00.000Z',
    values: originalValues,
    version: 4,
} satisfies DictionaryCard;
const reviewJob = {
    cancellationRequested: false,
    cardId: card.id,
    completedAt: null,
    createdAt: '2026-08-21T10:01:00.000Z',
    dictionaryId: dictionary.id,
    expectedCardVersion: 4,
    expectedDictionaryVersion: 3,
    expectedSettingsVersion: 2,
    expiresAt: '2026-08-28T10:01:00.000Z',
    failure: null,
    format: 'single-card:v1',
    id: '30000000-0000-4000-8000-000000000001',
    kind: 'single-card',
    originalSnapshot: {
        authorship: 'human',
        effectiveSettings: card.effectiveSettings,
        overrides,
        values: originalValues,
    },
    outcome: null,
    progress: { percent: 100, stage: 'review_ready' },
    proposal: {
        candidate: {
            overrides,
            values: { ...originalValues, source: 'to draw a distinction' },
        },
        fieldFeedback: [
            {
                alternatives: ['draw a line', '<b>distinguish</b>'],
                field: 'source',
                reason: '<svg onload=alert(1)>Fixed expression',
            },
        ],
        warnings: ['<iframe src=javascript:alert(1)>Review register'],
    },
    sourceLanguage: 'en',
    state: 'review',
    targetLanguage: 'ar',
    updatedAt: '2026-08-21T10:02:00.000Z',
} satisfies DictionarySingleCardGenerationJob;

function panel(
    overrides: Partial<Parameters<typeof DictionaryGenerationPanel>[0]> = {},
) {
    return render(
        <DictionaryGenerationPanel
            available
            card={card}
            dictionary={dictionary}
            job={reviewJob}
            languages={languages}
            onAccept={vi.fn().mockResolvedValue(undefined)}
            onCancel={vi.fn().mockResolvedValue(undefined)}
            onClose={vi.fn()}
            onDiscard={vi.fn().mockResolvedValue(undefined)}
            onRegenerate={vi.fn().mockResolvedValue(undefined)}
            onReloadCompare={vi.fn().mockResolvedValue(undefined)}
            onStart={vi.fn().mockResolvedValue(undefined)}
            pendingAction={false}
            {...overrides}
        />,
    );
}

describe('dictionary generation review', () => {
    const originalShowModal = HTMLDialogElement.prototype.showModal;
    const originalClose = HTMLDialogElement.prototype.close;

    beforeAll(() => {
        HTMLDialogElement.prototype.showModal = function showModalForTest() {
            this.setAttribute('open', '');
        };
        HTMLDialogElement.prototype.close = function closeForTest() {
            this.removeAttribute('open');
        };
    });

    afterAll(() => {
        HTMLDialogElement.prototype.showModal = originalShowModal;
        HTMLDialogElement.prototype.close = originalClose;
    });

    it('keeps a reloaded review stale until it is regenerated from authoritative versions', () => {
        expect(
            isGenerationJobStale(reviewJob, {
                card: { ...card, version: card.version + 1 },
                dictionaryVersion: dictionary.version,
            }),
        ).toBe(true);
        expect(
            isGenerationJobStale(reviewJob, {
                card,
                dictionaryVersion: dictionary.version,
            }),
        ).toBe(false);
    });

    it('renders untrusted multilingual proposal content inertly with field feedback', () => {
        const { container } = panel();
        expect(
            screen.getByText('<script>alert(1)</script>'),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/<svg onload=alert\(1\)>Fixed expression/),
        ).toBeInTheDocument();
        expect(
            screen.getByText('<iframe src=javascript:alert(1)>Review register'),
        ).toBeInTheDocument();
        expect(
            container.querySelector('script, img, svg[onload], iframe'),
        ).toBeNull();
        expect(screen.getAllByDisplayValue('تمييز')[0]).toHaveAttribute(
            'lang',
            'ar',
        );
        expect(screen.getAllByDisplayValue('تمييز')[0]).toHaveAttribute(
            'dir',
            'rtl',
        );
        expect(
            screen.getAllByText('يميّز القيّم بين الفترتين.')[0],
        ).toHaveAttribute('lang', 'ar');
    });

    it('retains candidate override families and dormant values through editing and acceptance without client authorship', async () => {
        const user = userEvent.setup();
        const onAccept = vi.fn().mockResolvedValue(undefined);
        const retainedOverrides = {
            definitionEnabled: 'enabled',
            definitionLanguage: 'target',
            exampleEnabled: 'disabled',
            exampleLanguage: 'target',
            exampleTranslationEnabled: 'enabled',
            transcriptionCustomLabel: 'Studio',
            transcriptionEnabled: 'disabled',
            transcriptionNotation: 'custom',
        } as const;
        const candidate = {
            overrides: retainedOverrides,
            values: {
                ...reviewJob.proposal.candidate.values,
                example: 'A stored disabled example',
                transcription: 'A stored disabled transcription',
            },
        };
        panel({
            onAccept,
            job: {
                ...reviewJob,
                proposal: { ...reviewJob.proposal, candidate },
            },
        });

        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        const alternative = screen
            .getByText('<b>distinguish</b>')
            .closest('li')!;
        await user.click(
            within(alternative).getByRole('button', { name: 'Use this' }),
        );
        const translation = within(
            screen.getByRole('region', { name: /^Translation/ }),
        ).getByRole('textbox');
        await user.clear(translation);
        await user.type(translation, 'تمييز جديد');
        await user.click(
            screen.getByRole('button', { name: 'Accept and update card' }),
        );

        expect(onAccept).toHaveBeenCalledExactlyOnceWith({
            overrides: retainedOverrides,
            values: {
                ...candidate.values,
                source: '<b>distinguish</b>',
                translation: 'تمييز جديد',
            },
        });
        expect(onAccept.mock.calls[0]?.[0]).not.toHaveProperty('authorship');
    });

    it.each(['Source', 'Translation'])(
        'bounds edited %s by Unicode code points before acceptance',
        async (field) => {
            const user = userEvent.setup();
            const onAccept = vi.fn().mockResolvedValue(undefined);
            panel({ onAccept });
            const input = within(
                screen.getByRole('region', { name: new RegExp(`^${field}`) }),
            ).getByRole('textbox');
            const accept = screen.getByRole('button', {
                name: 'Accept and update card',
            });
            const fieldKey = field === 'Source' ? 'source' : 'translation';
            const astralValue = '😀'.repeat(200);

            fireEvent.change(input, { target: { value: astralValue } });
            expect(input).toHaveValue(astralValue);
            expect(accept).toBeEnabled();
            await user.click(accept);
            expect(onAccept.mock.calls[0]?.[0].values[fieldKey]).toBe(
                astralValue,
            );

            fireEvent.change(input, { target: { value: 'a'.repeat(201) } });
            expect(input).toHaveValue('a'.repeat(200));
            await user.click(accept);
            expect(onAccept.mock.calls[1]?.[0].values[fieldKey]).toBe(
                'a'.repeat(200),
            );
        },
    );

    it('preserves an invalid retained value for correction while preventing acceptance', async () => {
        const user = userEvent.setup();
        const onAccept = vi.fn().mockResolvedValue(undefined);
        const source = 'a'.repeat(201);
        panel({
            onAccept,
            job: {
                ...reviewJob,
                proposal: {
                    ...reviewJob.proposal,
                    candidate: {
                        ...reviewJob.proposal.candidate,
                        values: {
                            ...reviewJob.proposal.candidate.values,
                            source,
                        },
                    },
                },
            },
        });
        expect(screen.getByDisplayValue(source)).toBeInTheDocument();
        const accept = screen.getByRole('button', {
            name: 'Accept and update card',
        });
        expect(accept).toBeDisabled();
        await user.click(accept);
        expect(onAccept).not.toHaveBeenCalled();
    });

    it('keeps stale conflict recovery explicit and catches rejected actions', async () => {
        const user = userEvent.setup();
        const onReloadCompare = vi.fn().mockRejectedValue(new Error('offline'));
        panel({ conflict: true, onReloadCompare });
        expect(
            screen.getByRole('button', { name: 'Accept and update card' }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Reload and compare' }),
        );
        await waitFor(() => expect(onReloadCompare).toHaveBeenCalledOnce());
    });

    it('keeps retained proposals reviewable while new generation is unavailable', () => {
        panel({ available: false });

        expect(screen.getAllByText('Saved now')[0]).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Regenerate' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Accept and update card' }),
        ).toBeEnabled();
    });
});
