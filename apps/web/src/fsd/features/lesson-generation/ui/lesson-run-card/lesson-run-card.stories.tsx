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
        onPreview: noAction,
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
export const AutomaticExerciseProgress: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...run,
            state: 'running',
            pauseReason: undefined,
            activeTurnId: '44444444-4444-4444-8444-444444444444',
            completedTaskCount: 3,
            automation: {
                enabled: true,
                maximumCredits: '5',
                remainingCredits: '3.750',
            },
            tasks: run.tasks.map((task) =>
                task.id === 'practice'
                    ? {
                          ...task,
                          status: 'running',
                          completedUnitCount: 2,
                          totalUnitCount: 4,
                      }
                    : { ...task, status: 'completed' },
            ),
        }),
    },
};
export const RussianExerciseProgress: Story = {
    ...AutomaticExerciseProgress,
    parameters: { locale: 'ru' },
};

export const AutomaticRepair: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...AutomaticExerciseProgress.args?.run,
            automation: {
                ...AutomaticExerciseProgress.args?.run?.automation,
                recoveringTaskId: 'practice',
            },
        }),
    },
};
export const SavedContentAfterValidationFailure: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...AutomaticExerciseProgress.args?.run,
            state: 'paused',
            activeTurnId: null,
            automation: undefined,
            pauseReason: 'technical-failure',
            failure: {
                code: 'content-invalid',
                taskId: 'practice',
                paths: ['tasks.0.blocks.0.semantics.checking.key'],
            },
        }),
    },
};
export const ExhaustedExercise: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...SavedContentAfterValidationFailure.args?.run,
            failure: {
                ...SavedContentAfterValidationFailure.args?.run?.failure,
                recoveryExhausted: true,
            },
        }),
    },
};
export const ReconnectingAfterValidationFailure: Story = {
    args: { ...SavedContentAfterValidationFailure.args, reconnecting: true },
};
export const BetweenAutomaticStages: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...AutomaticExerciseProgress.args?.run,
            state: 'paused',
            activeTurnId: null,
            pauseReason: 'budget',
        }),
    },
};
export const PartialVocabulary: Story = {
    args: {
        run: GenerationRunSummarySchema.parse({
            ...run,
            completedTaskCount: 0,
            totalTaskCount: 1,
            tasks: [
                {
                    id: 'vocabulary',
                    kind: 'vocabulary',
                    status: 'pending',
                    label: 'Everyday French vocabulary · 200 entries',
                    completedUnitCount: 20,
                    totalUnitCount: 200,
                },
            ],
        }),
    },
};
export const Stopping: Story = {
    args: { ...Running.args, stopping: true, busy: true },
};
export const TechnicalFailure: Story = {
    args: { run: { ...run, pauseReason: 'technical-failure' } },
};
export const ReadingFormatFailure: Story = {
    args: {
        run: {
            ...run,
            pauseReason: 'technical-failure',
            completedTaskCount: 0,
            tasks: [
                {
                    id: 'reading',
                    kind: 'prose',
                    status: 'failed',
                    label: 'Texte de lecture',
                },
            ],
            totalTaskCount: 1,
            failure: {
                code: 'schema-invalid',
                phase: 'decode',
                taskId: 'reading',
                finishReason: 'tool-calls',
            },
        },
    },
};
export const FilteredResponse: Story = {
    args: {
        run: {
            ...run,
            pauseReason: 'technical-failure',
            failure: {
                code: 'provider-rejected',
                phase: 'decode',
                finishReason: 'content-filter',
            },
        },
    },
};
export const UnknownFailure: Story = {
    args: {
        run: {
            ...run,
            pauseReason: 'technical-failure',
            failure: {
                code: 'unknown',
                referenceId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            },
        },
    },
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

const recording = GenerationRunSummarySchema.parse({
    ...run,
    pauseReason: 'recording-confirmation',
    completedTaskCount: 0,
    totalTaskCount: 2,
    tasks: [
        {
            id: 'recording',
            kind: 'audio',
            label: 'French dialogue about the reading',
            status: 'pending',
        },
        {
            id: 'question',
            kind: 'exercises',
            label: 'Listening comprehension question',
            status: 'pending',
        },
    ],
    recordingApproval: {
        requestId: '44444444-4444-4444-8444-444444444444',
        quote: {
            id: '55555555-5555-4555-8555-555555555555',
            scope: 'listening-lesson',
            maximumCredits: '2.500',
            approximateOutputTokens: 2500,
            expiresAt: '2099-01-01T00:00:00.000Z',
        },
    },
});

export const RecordingConfirmation: Story = {
    args: { run: recording, onRecordingDecision: noAction },
};
export const RecordingEstimateExpired: Story = {
    args: {
        run: recording,
        recordingQuote: {
            ...recording.recordingApproval!.quote,
            expiresAt: '2020-01-01T00:00:00.000Z',
        },
        onRecordingDecision: noAction,
    },
};
