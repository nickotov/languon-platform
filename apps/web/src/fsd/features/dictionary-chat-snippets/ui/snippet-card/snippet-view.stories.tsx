import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DictionaryChatSnippet } from '@languon/contracts';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import {
    DictionarySnippetView,
    type DictionarySnippetViewProps,
} from './snippet-view';

const shopping = [
    ['Bonjour', 'Здравствуйте; добрый день'],
    ['le magasin', 'магазин'],
    ['faire les courses', 'делать покупки'],
    ['le panier', 'корзина'],
    ['la caisse', 'касса'],
    ['Combien ça coûte ?', 'Сколько это стоит?'],
    ['la carte bancaire', 'банковская карта'],
    ['le reçu', 'чек'],
    ['Je regarde seulement.', 'Я только смотрю.'],
    ['le marché', 'рынок'],
] as const;

function createSnippet(count: number): DictionaryChatSnippet {
    return {
        id: 'a4a957bc-1679-4b62-b0d1-777a44d8a363',
        dictionaryId: '8c766b64-7e0a-4ff1-8597-58f86bb12a21',
        conversationId: 'f52dc544-53c0-437f-a7f0-6848e5cf053d',
        turnId: '05c51ca5-52e2-4f04-b707-7e5f12ded9f7',
        createdAt: '2026-11-11T10:00:00.000Z',
        title: 'Shopping in France: useful words and phrases',
        generationContext: {
            sourceLanguage: 'fr',
            targetLanguage: 'ru',
            translationContext: 'Everyday shopping in France.',
            dictionaryVersion: 1,
            settingsVersion: 1,
            settings: {
                transcriptionEnabled: true,
                transcriptionNotation: 'ipa',
                transcriptionCustomLabel: null,
                definitionEnabled: true,
                definitionLanguage: 'source',
                exampleEnabled: true,
                exampleLanguage: 'source',
                exampleTranslationEnabled: true,
            },
        },
        cards: Array.from({ length: count }, (_, index) => {
            const [source, translation] = shopping[index % shopping.length]!;

            return {
                source,
                translation,
                transcription: 'bɔ̃.ʒuʁ',
                definition:
                    'Une expression utile dans les échanges quotidiens.',
                example: 'Bonjour, madame.',
                exampleTranslation: 'Здравствуйте, мадам.',
            };
        }),
    };
}

function doNothing() {}

function InteractivePreview(args: DictionarySnippetViewProps) {
    const [expanded, setExpanded] = useState(args.expanded);
    const [selected, setSelected] = useState([...args.selected]);

    function toggleExpanded() {
        setExpanded((current) => !current);
    }

    function toggle(index: number) {
        setSelected((current) =>
            current.includes(index)
                ? current.filter((value) => value !== index)
                : [...current, index].sort((a, b) => a - b),
        );
    }

    function toggleAll() {
        setSelected((current) =>
            current.length === args.snippet.cards.length
                ? []
                : args.snippet.cards.map((_, index) => index),
        );
    }

    return (
        <DictionarySnippetView
            {...args}
            expanded={expanded}
            selected={selected}
            onToggleExpanded={toggleExpanded}
            onToggle={toggle}
            onToggleAll={toggleAll}
        />
    );
}

const ten = createSnippet(10);
const fifty = createSnippet(50);
const allTen = ten.cards.map((_, index) => index);
const meta = {
    title: 'Dictionary/Chat snippet',
    component: DictionarySnippetView,
    render: InteractivePreview,
    decorators: [
        (Story, context) => {
            const russian = context.parameters.locale === 'ru';
            const locale = russian ? 'ru' : 'en';
            const messages = russian ? ru : en;

            return (
                <I18nProvider locale={locale} messages={messages}>
                    <Story />
                </I18nProvider>
            );
        },
    ],
    args: {
        snippet: ten,
        expanded: false,
        selected: allTen,
        onToggleExpanded: doNothing,
        onToggle: doNothing,
        onToggleAll: doNothing,
        onAppend: doNothing,
        onPrepend: doNothing,
        onReplace: doNothing,
        onRetry: doNothing,
    },
} satisfies Meta<typeof DictionarySnippetView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {};
export const Expanded: Story = { args: { expanded: true } };
export const FiftyCards: Story = {
    args: {
        snippet: fifty,
        expanded: true,
        selected: fifty.cards.map((_, index) => index),
    },
    parameters: { locale: 'ru' },
};
export const MixedSelection: Story = {
    args: { expanded: true, selected: [0, 2, 5] },
};
export const NoSelection: Story = { args: { expanded: true, selected: [] } };
export const ExpandedEntry: Story = {
    args: { expanded: true },
    play: ({ canvasElement }) => {
        const button = canvasElement.querySelector<HTMLButtonElement>(
            '[data-dictionary-snippet-index="0"] button[aria-expanded]',
        );

        button?.click();
    },
};
export const PendingWhileCompact: Story = { args: { pending: true } };
export const RetryWhileCompact: Story = {
    args: {
        error: 'The connection was interrupted. Retry the same insertion.',
        canRetry: true,
    },
};
export const LongContent: Story = {
    args: {
        expanded: true,
        snippet: {
            ...ten,
            title: 'Покупки во Франции: полезные слова и выражения для повседневного общения в магазине и на рынке',
            cards: [
                {
                    ...ten.cards[0]!,
                    source: 'Est-ce que je peux payer avec une carte bancaire étrangère, s’il vous plaît ?',
                    translation:
                        'Подскажите, пожалуйста, можно ли оплатить покупки банковской картой, выпущенной в другой стране?',
                },
            ],
        },
        selected: [0],
    },
    parameters: { locale: 'ru' },
};
