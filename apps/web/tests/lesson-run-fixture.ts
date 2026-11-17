import {
    GenerationPlanSchema,
    GenerationRunSummarySchema,
    ConversationTurnSchema,
} from '@languon/contracts';

export const runId = '11111111-1111-4111-8111-111111111111';
export const lessonPlan = GenerationPlanSchema.parse({
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
            instruction: 'COD and COI in passive voice',
            language: 'fr',
            explanationLanguage: 'fr',
            inputs: [],
        },
    ],
    outputOrder: ['reading', 'grammar'],
});
export const lessonRun = GenerationRunSummarySchema.parse({
    id: runId,
    conversationId: runId,
    noteId: runId,
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
export const lessonTurn = ConversationTurnSchema.parse({
    id: runId,
    conversationId: runId,
    modelId: null,
    status: 'queued',
    failureCode: null,
    usage: {
        inputTokens: 0,
        outputTokens: 0,
        chargedCredits: '0',
        estimated: false,
    },
    createdAt: '2026-11-16T00:01:00.000Z',
    updatedAt: '2026-11-16T00:01:00.000Z',
});
