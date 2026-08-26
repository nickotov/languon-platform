import type {
    DictionaryDocumentTermsGenerationJob,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionaryDocumentGenerationPanel } from './dictionary-document-generation-panel';

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
const dictionary = {
    activeCardCount: 4,
    archivedAt: null,
    createdAt: '2026-08-26T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'Document terms',
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
    sourceLanguage: 'en',
    targetLanguage: 'ar',
    updatedAt: '2026-08-26T10:00:00.000Z',
    version: 2,
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
    expectedDictionaryVersion: 2,
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
                        definition: 'A precise difference.',
                        example: null,
                        exampleTranslation: null,
                        source: 'distinction',
                        transcription: null,
                        translation: 'تمييز',
                    },
                },
                fieldFeedback: [],
                input: 'distinction',
                rowIndex: 0,
            },
        ],
        failures: [],
        warnings: [],
    },
    sourceLanguage: 'en',
    state: 'review',
    targetLanguage: 'ar',
    updatedAt: '2026-08-26T10:02:00.000Z',
} satisfies DictionaryDocumentTermsGenerationJob;

const meta = {
    component: DictionaryDocumentGenerationPanel,
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
        nativeExtractionAvailable: true,
        ocrAvailable: false,
        onAccept: async () => undefined,
        onCancel: async () => undefined,
        onClose: () => undefined,
        onDiscard: async () => undefined,
        onReloadConflict: async () => undefined,
        onRetryFailures: async () => undefined,
        onStart: async () => undefined,
        pendingAction: false,
    },
    title: 'Features/Dictionary document generation',
} satisfies Meta<typeof DictionaryDocumentGenerationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Input: Story = {};
export const Processing: Story = {
    args: {
        job: {
            ...reviewJob,
            expiresAt: null,
            progress: { percent: 48, stage: 'extracting' },
            proposal: null,
            state: 'running',
        },
    },
};
export const Review: Story = { args: { job: reviewJob } };
export const MobileReview: Story = {
    args: { job: reviewJob },
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
export const UnavailableOcr: Story = {
    args: { nativeExtractionAvailable: true, ocrAvailable: false },
};
