import type {
    DictionaryCard,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

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
            screen.getByText('<svg onload=alert(1)>Fixed expression'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('<iframe src=javascript:alert(1)>Review register'),
        ).toBeInTheDocument();
        expect(container.querySelector('script, img, svg, iframe')).toBeNull();
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

    it('edits all candidate override families and submits no client authorship', async () => {
        const user = userEvent.setup();
        const onAccept = vi.fn().mockResolvedValue(undefined);
        panel({ onAccept });
        await user.selectOptions(
            screen.getByLabelText('Definition language'),
            'target',
        );
        await user.selectOptions(
            screen.getByRole('combobox', { name: 'Context example' }),
            'disabled',
        );
        await user.selectOptions(
            screen.getByLabelText('Transcription notation'),
            'custom',
        );
        await user.type(
            screen.getByLabelText(/Custom notation label/),
            'Studio',
        );
        await user.click(
            screen.getByRole('button', { name: '<b>distinguish</b>' }),
        );
        await user.click(
            screen.getByRole('button', { name: 'Accept reviewed card' }),
        );
        expect(onAccept).toHaveBeenCalledWith(
            expect.objectContaining({
                overrides: expect.objectContaining({
                    definitionLanguage: 'target',
                    exampleEnabled: 'disabled',
                    transcriptionCustomLabel: 'Studio',
                    transcriptionNotation: 'custom',
                }),
                values: expect.objectContaining({
                    source: '<b>distinguish</b>',
                }),
            }),
        );
        expect(onAccept.mock.calls[0]?.[0]).not.toHaveProperty('authorship');
    });

    it('keeps stale conflict recovery explicit and catches rejected actions', async () => {
        const user = userEvent.setup();
        const onReloadCompare = vi.fn().mockRejectedValue(new Error('offline'));
        panel({ conflict: true, onReloadCompare });
        expect(
            screen.getByRole('button', { name: 'Accept reviewed card' }),
        ).toBeDisabled();
        await user.click(
            screen.getByRole('button', { name: 'Reload and compare' }),
        );
        await waitFor(() => expect(onReloadCompare).toHaveBeenCalledOnce());
    });

    it('keeps retained proposals reviewable while new generation is unavailable', () => {
        panel({ available: false });

        expect(screen.getByText('Original card')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Regenerate proposal' }),
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Accept reviewed card' }),
        ).toBeEnabled();
    });
});
