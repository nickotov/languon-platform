import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { Flashcard } from './flashcard';

const meta = {
    component: Flashcard,
    title: 'Features/Flashcard training/Card',
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
    args: {
        face: 'front',
        position: '1 / 32',
        ratingDisabled: false,
        flipDisabled: false,
        onFlip() {},
        onRate() {},
        item: {
            entryId: '10000000-0000-4000-8000-000000000001',
            learningVersion: 1,
            front: [
                {
                    field: 'targetExample',
                    requestedFields: ['targetExample'],
                    text: 'The kitchen smells good.',
                    language: 'en',
                    direction: 'ltr',
                    fallback: false,
                },
            ],
            back: [
                {
                    field: 'sourceExample',
                    requestedFields: ['sourceExample'],
                    text: 'La cocina huele bien.',
                    language: 'es',
                    direction: 'ltr',
                    fallback: false,
                },
            ],
        },
    },
} satisfies Meta<typeof Flashcard>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
export const Back: StoryObj<typeof meta> = { args: { face: 'back' } };
export const MissingExampleAndRtl: StoryObj<typeof meta> = {
    args: {
        item: {
            entryId: '10000000-0000-4000-8000-000000000001',
            learningVersion: 1,
            front: [
                {
                    field: 'translation',
                    requestedFields: ['targetExample'],
                    text: 'المطبخ',
                    language: 'ar',
                    direction: 'rtl',
                    fallback: true,
                },
            ],
            back: [
                {
                    field: 'source',
                    requestedFields: ['sourceExample'],
                    text: 'kitchen',
                    language: 'en',
                    direction: 'ltr',
                    fallback: true,
                },
            ],
        },
    },
};
