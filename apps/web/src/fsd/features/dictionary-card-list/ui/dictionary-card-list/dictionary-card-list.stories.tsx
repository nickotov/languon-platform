import type {
    DictionaryCard,
    LanguageCatalogEntry,
    OwnedDictionary,
} from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionaryCardList } from './dictionary-card-list';

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
const dictionary = {
    activeCardCount: 1,
    archivedAt: null,
    createdAt: '2026-08-21T10:00:00.000Z',
    description: null,
    id: '10000000-0000-4000-8000-000000000001',
    languagePairLocked: true,
    lifecycle: 'active',
    name: 'Spanish for studio visits',
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
} satisfies OwnedDictionary;
const card = {
    archivedAt: null,
    authorship: 'mixed',
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
        definition: null,
        example: 'The curator draws a distinction.',
        exampleTranslation: 'La comisaria establece una distinción.',
        source: 'to draw a distinction',
        transcription: null,
        translation: 'establecer una distinción',
    },
    version: 1,
} satisfies DictionaryCard;

const meta = {
    component: DictionaryCardList,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    title: 'Dictionary/Ordered card list',
} satisfies Meta<typeof DictionaryCardList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        cards: [card],
        dictionary,
        languages,
        lifecycle: 'active',
        onEdit: () => undefined,
        onLifecycle: () => undefined,
        onMove: () => undefined,
        pending: false,
    },
};

export const FilteredReorderDisabled: Story = {
    args: { ...Default.args, reorderEnabled: false },
};
