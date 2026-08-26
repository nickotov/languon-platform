import type { LanguageCatalogEntry, OwnedDictionary } from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { BottomSheet } from '@/fsd/shared/ui';

import { DictionaryCardForm } from './dictionary-card-form';

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
const dictionary = {
    activeCardCount: 12,
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

const meta = {
    component: DictionaryCardForm,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    title: 'Dictionary/Card form',
} satisfies Meta<typeof DictionaryCardForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NewCard: Story = {
    args: {
        dictionary,
        existingSources: ['medium'],
        languages,
        onCancel: () => undefined,
        onSave: async () => undefined,
        pending: false,
    },
};

export const Compact320: Story = {
    args: NewCard.args,
    decorators: [
        (Story) => (
            <div style={{ width: 320 }}>
                <Story />
            </div>
        ),
    ],
};

export const FocusedEditorOverlay: Story = {
    args: {
        ...NewCard.args,
        embedded: true,
        showHeading: false,
    },
    render: (args) => (
        <BottomSheet
            closeLabel='Cancel editing'
            onClose={() => undefined}
            open
            size='large'
            title='Add card'
        >
            <DictionaryCardForm {...args} />
        </BottomSheet>
    ),
};

export const MixedDirectionEditorOverlay: Story = {
    args: {
        ...NewCard.args,
        dictionary: {
            ...dictionary,
            name: 'Arabic and English studio terms',
            sourceLanguage: 'ar',
            targetLanguage: 'en',
        },
        embedded: true,
        showHeading: false,
    },
    render: (args) => (
        <BottomSheet
            closeLabel='Cancel editing'
            onClose={() => undefined}
            open
            size='large'
            title='Add card'
        >
            <DictionaryCardForm {...args} />
        </BottomSheet>
    ),
};
