import type {
    DictionaryCard,
    DictionarySingleCardGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionaryGenerationPanel } from './dictionary-generation-panel';

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
const values = {
    definition: 'A difference between similar ideas.',
    example: 'The curator draws a distinction between the periods.',
    exampleTranslation: 'يميّز القيّم بين الفترتين.',
    source: 'draw distinction',
    transcription: null,
    translation: 'تمييز',
};
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
const effectiveSettings = {
    definitionEnabled: true,
    definitionLanguage: 'source',
    exampleEnabled: true,
    exampleLanguage: 'source',
    exampleTranslationEnabled: true,
    exampleTranslationLanguage: 'target',
    transcriptionCustomLabel: null,
    transcriptionEnabled: false,
    transcriptionNotation: 'ipa',
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
        values: {
            definitionEnabled: true,
            definitionLanguage: 'source',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
        },
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
const card = {
    archivedAt: null,
    authorship: 'human',
    createdAt: '2026-08-21T10:00:00.000Z',
    dictionaryId: dictionary.id,
    effectiveSettings,
    id: '20000000-0000-4000-8000-000000000001',
    lifecycle: 'active',
    overrides,
    position: '1000',
    settingsVersion: 2,
    updatedAt: '2026-08-21T10:00:00.000Z',
    values,
    version: 4,
} satisfies DictionaryCard;
const baseJob = {
    cancellationRequested: false,
    cardId: card.id,
    completedAt: null,
    createdAt: '2026-08-21T10:01:00.000Z',
    dictionaryId: dictionary.id,
    expectedCardVersion: 4,
    expectedDictionaryVersion: 3,
    expectedSettingsVersion: 2,
    expiresAt: null,
    failure: null,
    format: 'single-card:v1',
    id: '30000000-0000-4000-8000-000000000001',
    kind: 'single-card',
    originalSnapshot: {
        authorship: 'human',
        effectiveSettings,
        overrides,
        values,
    },
    outcome: null,
    progress: { percent: 45, stage: 'generating' },
    proposal: null,
    sourceLanguage: 'en',
    state: 'running',
    targetLanguage: 'ar',
    updatedAt: '2026-08-21T10:02:00.000Z',
} satisfies DictionarySingleCardGenerationJob;
const reviewJob = {
    ...baseJob,
    expiresAt: '2026-08-28T10:02:00.000Z',
    progress: { percent: 100, stage: 'review_ready' },
    proposal: {
        candidate: {
            overrides,
            values: { ...values, source: 'draw a distinction' },
        },
        fieldFeedback: [
            {
                alternatives: ['make a distinction', 'distinguish'],
                field: 'source',
                reason: 'The fixed expression needs an article.',
            },
        ],
        warnings: ['Review the register for your intended context.'],
    },
    state: 'review',
} satisfies DictionarySingleCardGenerationJob;

const meta = {
    component: DictionaryGenerationPanel,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    title: 'Dictionary/Generation review',
} satisfies Meta<typeof DictionaryGenerationPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const actions = {
    onAccept: async () => undefined,
    onCancel: async () => undefined,
    onClose: () => undefined,
    onDiscard: async () => undefined,
    onRegenerate: async () => undefined,
    onReloadCompare: async () => undefined,
    onStart: async () => undefined,
};

export const RunningKnownStage: Story = {
    args: {
        ...actions,
        available: true,
        card,
        dictionary,
        job: baseJob,
        languages,
        pendingAction: false,
    },
};

export const EditableReview: Story = {
    args: { ...RunningKnownStage.args, job: reviewJob },
};

export const StaleConflict: Story = {
    args: { ...EditableReview.args, conflict: true },
};

export const Compact320: Story = {
    args: EditableReview.args,
    decorators: [
        (Story) => (
            <div style={{ width: 320 }}>
                <Story />
            </div>
        ),
    ],
};

export const CapabilityUnavailable: Story = {
    args: {
        ...actions,
        available: false,
        card,
        dictionary,
        languages,
        pendingAction: false,
    },
};

export const RollbackReadableReview: Story = {
    args: {
        ...EditableReview.args,
        available: false,
    },
};

export const Cancelled: Story = {
    args: {
        ...RunningKnownStage.args,
        job: {
            ...baseJob,
            completedAt: '2026-08-21T10:03:00.000Z',
            originalSnapshot: null,
            progress: { percent: 45, stage: 'terminal' },
            state: 'cancelled',
        },
    },
};

export const FailedRetryable: Story = {
    args: {
        ...RunningKnownStage.args,
        job: {
            ...baseJob,
            completedAt: '2026-08-21T10:03:00.000Z',
            failure: {
                code: 'provider_unavailable',
                message: 'The generation provider is temporarily unavailable.',
                retryable: true,
            },
            originalSnapshot: null,
            progress: { percent: 45, stage: 'terminal' },
            state: 'failed',
        },
    },
};
