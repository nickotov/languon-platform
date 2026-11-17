import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { ru } from '@/fsd/shared/i18n/messages/ru';
import styles from './lesson-run-card.stories.module.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GenerationRunSummarySchema } from '@languon/contracts';
import { LessonRunCard } from './lesson-run-card';

const run = GenerationRunSummarySchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    conversationId: '22222222-2222-4222-8222-222222222222',
    noteId: '33333333-3333-4333-8333-333333333333',
    revision: 1,
    state: 'paused',
    pauseReason: 'budget',
    activeTurnId: null,
    proposalId: null,
    tasks: [
        {
            id: 'reading',
            kind: 'bilingual-text',
            label: 'Democracy in France · reading and Russian translation',
            status: 'completed',
        },
        {
            id: 'comprehension',
            kind: 'exercises',
            label: 'Reading comprehension · 3 exercises',
            status: 'completed',
        },
        {
            id: 'grammar',
            kind: 'grammar',
            label: 'COD and COI · direct and indirect objects, including passive voice',
            status: 'pending',
        },
        {
            id: 'practice',
            kind: 'exercises',
            label: 'Grammar practice · 4 exercises',
            status: 'pending',
        },
    ],
    completedTaskCount: 2,
    totalTaskCount: 4,
    chargedCredits: '1.250',
    createdAt: '2026-11-16T10:00:00.000Z',
    updatedAt: '2026-11-16T10:01:00.000Z',
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
    title: 'Features/Lesson generation/Run',
    component: LessonRunCard,
    args: {
        run,
        busy: false,
        reconnecting: false,
        stopping: false,
        onContinue: noAction,
        onStop: noAction,
        onAdjust: noAction,
        onDiscard: noAction,
        onKeepSources: noAction,
        onRefreshSources: noAction,
    },
} satisfies Meta<typeof LessonRunCard>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Paused: Story = {};
export const Running: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...run,
            state: 'running',
            pauseReason: undefined,
            activeTurnId: '44444444-4444-4444-8444-444444444444',
            tasks: run.tasks.map((task) =>
                task.id === 'grammar' ? { ...task, status: 'running' } : task,
            ),
        }),
    },
};
export const Stopping: Story = {
    args: { ...Running.args, stopping: true, busy: true },
};
export const TechnicalFailure: Story = {
    args: { run: { ...run, pauseReason: 'technical-failure' } },
};
export const Stopped: Story = {
    args: { run: { ...run, pauseReason: 'stopped' } },
};
export const ChangedSources: Story = {
    args: { run: { ...run, pauseReason: 'source-changed' } },
};
export const Reconnecting: Story = { args: { reconnecting: true } };
export const Completed: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...run,
            state: 'completed',
            pauseReason: undefined,
            proposalId: '55555555-5555-4555-8555-555555555555',
            completedTaskCount: 4,
            tasks: run.tasks.map((task) => ({ ...task, status: 'completed' })),
        }),
    },
};
