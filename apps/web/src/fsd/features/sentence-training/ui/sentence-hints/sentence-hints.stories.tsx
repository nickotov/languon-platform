import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { SentenceExercise } from '@languon/contracts';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { SentenceWithHints } from './sentence-hints';

const exercise: SentenceExercise = {
    id: '00000000-0000-4000-8000-000000000001',
    dictionaryId: '00000000-0000-4000-8000-000000000002',
    direction: 'source-to-target',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    sourceText: 'A book, a book.',
    segments: [
        { id: 'segment-1', start: 0, end: 2, text: 'A ', target: null },
        {
            id: 'segment-2',
            start: 2,
            end: 6,
            text: 'book',
            target: {
                entryId: '00000000-0000-4000-8000-000000000003',
                hintId: 'hint-1',
                occurrenceId: 'occurrence-1',
            },
        },
        { id: 'segment-3', start: 6, end: 10, text: ', a ', target: null },
        {
            id: 'segment-4',
            start: 10,
            end: 14,
            text: 'book',
            target: {
                entryId: '00000000-0000-4000-8000-000000000003',
                hintId: 'hint-1',
                occurrenceId: 'occurrence-2',
            },
        },
        { id: 'segment-5', start: 14, end: 15, text: '.', target: null },
    ],
    hints: [{ id: 'hint-1', text: 'libro' }],
    generationPolicyVersion: 1,
    createdAt: '2026-10-04T00:00:00.000Z',
};
const meta = {
    component: SentenceWithHints,
    title: 'Training/Sentence hints',
    decorators: [
        (Story) => (
            <I18nProvider locale='en' messages={en}>
                <Story />
            </I18nProvider>
        ),
    ],
} satisfies Meta<typeof SentenceWithHints>;
export default meta;
export const Default: StoryObj<typeof meta> = {
    args: { exercise, revealedHintIds: [], onReveal() {} },
};
