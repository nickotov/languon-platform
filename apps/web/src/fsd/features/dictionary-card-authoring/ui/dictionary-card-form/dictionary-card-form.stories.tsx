import type { LanguageCatalogEntry, OwnedDictionary } from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { BottomSheet } from '@/fsd/shared/ui';

import { DictionaryCardForm } from './dictionary-card-form';
import { AutoSaveFeedback } from './auto-save-feedback';
import { generatedStoryCard } from './card-form-story-fixtures';

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
    translationContext: null,
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

function noStoryAction() {}

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
            <div style={{ maxWidth: 320, width: '100%' }}>
                <Story />
            </div>
        ),
    ],
};

export const InheritedTranslationContext: Story = {
    args: {
        ...NewCard.args,
        dictionary: {
            ...dictionary,
            translationContext:
                'Museum curation and contemporary art terminology',
        },
    },
};

export const AutoFilledInputs320: Story = {
    args: {
        ...NewCard.args,
        card: generatedStoryCard(dictionary),
        ai: {
            available: true,
            onAction: async () => undefined,
            pending: false,
        },
    },
    decorators: [
        (Story) => (
            <div style={{ maxWidth: 320, width: '100%' }}>
                <Story />
            </div>
        ),
    ],
};

export const AutoFilledInputsDesktop: Story = {
    args: AutoFilledInputs320.args,
    decorators: [
        (Story) => (
            <div style={{ maxWidth: 880, width: '100%' }}>
                <Story />
            </div>
        ),
    ],
};

export const LongMixedDirectionColumns: Story = {
    ...AutoFilledInputsDesktop,
    args: {
        ...AutoFilledInputsDesktop.args,
        dictionary: {
            ...dictionary,
            sourceLanguage: 'ar',
            targetLanguage: 'en',
        },
        card: {
            ...generatedStoryCard(dictionary),
            values: {
                ...generatedStoryCard(dictionary).values,
                source: 'مصطلح'.repeat(40),
                translation: 'term'.repeat(50),
                example: 'مثال طويل '.repeat(80),
                exampleTranslation: 'A long translated example. '.repeat(40),
            },
        },
    },
};

export const ExampleWithoutTranslation: Story = {
    ...AutoFilledInputsDesktop,
    args: {
        ...AutoFilledInputsDesktop.args,
        dictionary: {
            ...dictionary,
            settings: {
                ...dictionary.settings,
                values: {
                    ...dictionary.settings.values,
                    exampleTranslationEnabled: false,
                },
            },
        },
    },
};

export const AutomaticSaving: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='saving'
        />
    ),
};

export const AutomaticallySaved: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='saved'
        />
    ),
};

export const AutomaticSaveFailed: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='failed'
        />
    ),
};

export const InvalidGeneratedCandidate: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='invalid'
        />
    ),
};

export const SavedRefreshFailed: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='refreshFailed'
        />
    ),
};

export const NoChangesToSave: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='unchanged'
        />
    ),
};

export const ConflictingSave: Story = {
    args: NewCard.args,
    render: () => (
        <AutoSaveFeedback
            existing
            hasGeneratedContent
            onRetry={noStoryAction}
            status='conflict'
        />
    ),
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
            onClose={noStoryAction}
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
            onClose={noStoryAction}
            open
            size='large'
            title='Add card'
        >
            <DictionaryCardForm {...args} />
        </BottomSheet>
    ),
};
