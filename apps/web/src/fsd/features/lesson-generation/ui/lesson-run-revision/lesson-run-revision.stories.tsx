import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import styles from './lesson-run-revision.stories.module.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
    GenerationPlanSchema,
    GenerationRunSummarySchema,
    GenerationPlanRevisionCandidateSchema,
} from '@languon/contracts';
import { LessonRunRevision } from './lesson-run-revision';

const id = '11111111-1111-4111-8111-111111111111';
const plan = GenerationPlanSchema.parse({
    schemaVersion: 1,
    replyLanguage: 'en',
    sources: [],
    tasks: [
        {
            id: 'reading',
            kind: 'prose',
            instruction: 'A French reading about democracy',
            language: 'fr',
            inputs: [],
        },
        {
            id: 'grammar',
            kind: 'grammar',
            instruction: 'COD and COI: more passive-voice examples',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [],
        },
    ],
    outputOrder: ['reading', 'grammar'],
});
const run = GenerationRunSummarySchema.parse({
    id,
    conversationId: id,
    noteId: id,
    revision: 1,
    state: 'paused',
    pauseReason: 'budget',
    activeTurnId: null,
    proposalId: null,
    completedTaskCount: 1,
    totalTaskCount: 2,
    chargedCredits: '1.125',
    tasks: [
        {
            id: 'reading',
            kind: 'prose',
            label: 'French reading',
            status: 'completed',
        },
        {
            id: 'grammar',
            kind: 'grammar',
            label: 'COD and COI',
            status: 'pending',
        },
    ],
    createdAt: '2026-11-16T00:00:00.000Z',
    updatedAt: '2026-11-16T00:01:00.000Z',
});
const candidate = GenerationPlanRevisionCandidateSchema.parse({
    id,
    baseRevision: 1,
    plan,
    keptTaskIds: ['reading'],
    changedTaskIds: ['grammar'],
    addedTaskIds: [],
    removedTaskIds: [],
});

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
                    <div className={styles.canvas}>
                        <Story />
                    </div>
                </I18nProvider>
            );
        },
    ],
    title: 'Features/Lesson generation/Plan revision',
    component: LessonRunRevision,
    args: {
        candidate,
        run,
        busy: false,
        onApply: noAction,
        onDismiss: noAction,
    },
} satisfies Meta<typeof LessonRunRevision>;

export default meta;
type Story = StoryObj<typeof meta>;
export const ReuseAndUpdate: Story = {};
export const ReorderOnly: Story = {
    args: {
        candidate: {
            ...candidate,
            plan: { ...plan, outputOrder: ['grammar', 'reading'] },
            keptTaskIds: ['reading', 'grammar'],
            changedTaskIds: [],
        },
    },
};
export const StaleRevision: Story = { args: { run: { ...run, revision: 2 } } };
