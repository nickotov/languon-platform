import type { LanguageCatalogEntry, OwnedDictionary } from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionarySettingsForm } from './dictionary-settings-form';

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
    description: 'Vocabulary for gallery and studio conversations.',
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

const meta = {
    component: DictionarySettingsForm,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    title: 'Dictionary/Settings form',
} satisfies Meta<typeof DictionarySettingsForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PairLocked: Story = {
    args: {
        dictionary,
        languages,
        onSave: async () => undefined,
        pending: false,
    },
};

export const Conflict: Story = {
    args: {
        ...PairLocked.args,
        error: 'This dictionary changed elsewhere. Reload before saving again.',
    },
};
