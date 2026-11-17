import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LessonRunQuote } from './lesson-run-quote';

const quote = {
    id: '11111111-1111-4111-8111-111111111111',
    maximumCredits: '2.500',
    approximateOutputTokens: 5000,
    expiresAt: '2099-01-01T00:00:00.000Z',
};

function noAction() {}

const meta = {
    decorators: [
        (Story, context) => {
            const locale =
                (context.parameters.locale ?? context.globals.locale) === 'ru'
                    ? 'ru'
                    : 'en';

            return (
                <I18nProvider
                    locale={locale}
                    messages={locale === 'ru' ? ru : en}
                >
                    <Story />
                </I18nProvider>
            );
        },
    ],
    title: 'Features/Lesson generation/Stage budget',
    component: LessonRunQuote,
    args: {
        quote,
        busy: false,
        onConfirm: noAction,
        onRefresh: noAction,
        onClose: noAction,
    },
} satisfies Meta<typeof LessonRunQuote>;

export default meta;
type Story = StoryObj<typeof meta>;
export const ContinueBudget: Story = {};
export const ExpiredBudget: Story = {
    args: { quote: { ...quote, expiresAt: '2020-01-01T00:00:00.000Z' } },
};
export const RevisionBudget: Story = { args: { revision: true } };
