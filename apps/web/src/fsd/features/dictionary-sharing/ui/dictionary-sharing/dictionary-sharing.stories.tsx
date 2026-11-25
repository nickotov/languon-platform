import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OwnedDictionary } from '@languon/contracts';
import { fn } from 'storybook/test';
import { DictionarySharing } from './dictionary-sharing';

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
    translationContext: null,
    updatedAt: '2026-08-21T10:00:00.000Z',
    version: 1,
    visibility: 'private',
} satisfies OwnedDictionary;

const meta = {
    title: 'Dictionary/Sharing',
    component: DictionarySharing,
    args: {
        dictionary,
        pending: false,
        onRotate: fn(async () => ({
            shareId: 'storybook-dictionary',
            shareKey: 'fake-local-story-key',
        })),
        onRevoke: fn(async () => undefined),
    },
} satisfies Meta<typeof DictionarySharing>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Private: Story = {};
export const Unlisted: Story = {
    args: { dictionary: { ...dictionary, visibility: 'unlisted' } },
};
export const Pending: Story = {
    args: {
        dictionary: { ...dictionary, visibility: 'unlisted' },
        pending: true,
    },
};
