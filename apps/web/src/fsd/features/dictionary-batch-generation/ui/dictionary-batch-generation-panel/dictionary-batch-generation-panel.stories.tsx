import type {
    DictionaryPastedTermsGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionaryBatchGenerationPanel } from './dictionary-batch-generation-panel';

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
] satisfies LanguageCatalogEntry[];
const settings = {
    definitionEnabled: true,
    definitionLanguage: 'source',
    exampleEnabled: true,
    exampleLanguage: 'source',
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
    activeCardCount: 12,
    archivedAt: null,
    createdAt: '2026-08-25T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'English and Arabic',
    settings: {
        updatedAt: '2026-08-25T10:00:00.000Z',
        values: settings,
        version: 2,
    },
    settingsVersion: 2,
    sourceDictionaryId: null,
    sourceLanguage: 'en',
    targetLanguage: 'ar',
    updatedAt: '2026-08-25T10:00:00.000Z',
    version: 3,
    visibility: 'private',
} satisfies OwnedDictionary;
const candidate = {
    overrides,
    values: {
        definition: 'A difference between similar ideas.',
        example: 'The curator draws a distinction.',
        exampleTranslation: 'يميّز القيّم بين الفترتين.',
        source: 'distinction',
        transcription: null,
        translation: 'تمييز',
    },
};
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
                candidate,
                fieldFeedback: [
                    {
                        alternatives: ['difference'],
                        field: 'source',
                        reason: 'The noun form matches the pasted term.',
                    },
                ],
                input: 'distinction',
                rowIndex: 0,
            },
            {
                candidate: {
                    ...candidate,
                    values: {
                        ...candidate.values,
                        source: 'nuance',
                        translation: 'فارق دقيق',
                    },
                },
                fieldFeedback: [],
                input: 'nuance',
                rowIndex: 1,
            },
        ],
        failures: [
            {
                code: 'generation_failed',
                input: 'register',
                message: 'The provider timed out for this row.',
                retryable: true,
                rowIndex: 2,
            },
        ],
        warnings: [
            {
                code: 'duplicate_source',
                duplicateCardId: null,
                message: 'A card with this source phrase already exists.',
                rowIndex: 1,
            },
        ],
    },
    sourceLanguage: 'en',
    state: 'review',
    targetLanguage: 'ar',
    updatedAt: '2026-08-25T10:02:00.000Z',
} satisfies DictionaryPastedTermsGenerationJob;
const progressJob = {
    ...reviewJob,
    expiresAt: null,
    progress: { percent: 42, stage: 'generating' },
    proposal: null,
    state: 'running',
} satisfies DictionaryPastedTermsGenerationJob;
const cleanReviewJob = {
    ...reviewJob,
    proposal: {
        ...reviewJob.proposal!,
        failures: [],
        warnings: [],
    },
} satisfies DictionaryPastedTermsGenerationJob;

const meta = {
    component: DictionaryBatchGenerationPanel,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    args: {
        available: true,
        dictionary,
        languages,
        onAccept: async () => undefined,
        onCancel: async () => undefined,
        onClose: () => undefined,
        onDiscard: async () => undefined,
        onReloadConflict: async () => undefined,
        onRetryFailures: async () => undefined,
        onStart: async () => undefined,
        pendingAction: false,
    },
    title: 'Features/Dictionary batch generation',
} satisfies Meta<typeof DictionaryBatchGenerationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Input: Story = {};

export const Progress: Story = { args: { job: progressJob } };

export const Review: Story = { args: { job: cleanReviewJob } };

export const PartialFailure: Story = { args: { job: reviewJob } };

export const Conflict: Story = {
    args: {
        conflict: true,
        error: 'This dictionary changed elsewhere.',
        job: reviewJob,
    },
};

export const MobileReflow: Story = {
    args: { job: reviewJob },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
