import type { LanguageCatalogEntry } from '@languon/contracts';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';

import { DictionaryImportPanel } from './dictionary-import-panel';

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
] satisfies LanguageCatalogEntry[];

const meta = {
    component: DictionaryImportPanel,
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    args: {
        aiAvailable: true,
        languages,
        onCommit: async () => undefined,
        onPreview: async () => undefined,
        optionalFieldsEnabled: true,
        pending: false,
        preview: {
            capacity: { remainingRows: 24, wouldExceed: false },
            columns: [
                { heading: null, index: 0, samples: ['مصرف'] },
                { heading: null, index: 1, samples: ['bank'] },
            ],
            failures: [
                {
                    code: 'malformed_row',
                    message: 'The row has invalid quoting.',
                    rowIndex: 1,
                },
            ],
            rows: [{ rowIndex: 0, source: 'مصرف', translation: 'bank' }],
            summary: {
                duplicateRows: 0,
                failureRows: 1,
                readyRows: 1,
                totalRows: 2,
                truncated: false,
            },
            warnings: [],
        },
        sourceLanguage: 'ar',
        target: {
            dictionaryId: '10000000-0000-4000-8000-000000000001',
            expectedDictionaryVersion: 3,
            expectedSettingsVersion: 2,
            kind: 'existing',
        },
        targetLanguage: 'en',
    },
    title: 'Features/Dictionary interchange/Import',
} satisfies Meta<typeof DictionaryImportPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Input: Story = {};
export const MobileInput: Story = {
    parameters: { viewport: { defaultViewport: 'mobile1' } },
};
export const UnavailableAi: Story = {
    args: { aiAvailable: false },
};
