import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConversationEventSchema } from './contextual-assistant';
import {
    GenerationRunSummarySchema,
    ContinueGenerationRunRequestSchema,
    ApplyGenerationPlanRevisionRequestSchema,
    GenerationPlanRevisionCandidateSchema,
    GenerationRunDetailSchema,
} from './generation-runs';

const summary = {
    id: randomUUID(),
    conversationId: randomUUID(),
    noteId: randomUUID(),
    revision: 1,
    state: 'paused',
    pauseReason: 'budget',
    tasks: [
        { id: 'reading', kind: 'prose', status: 'completed', label: 'Reading' },
        { id: 'grammar', kind: 'grammar', status: 'pending', label: 'Grammar' },
    ],
    completedTaskCount: 1,
    totalTaskCount: 2,
    activeTurnId: null,
    proposalId: null,
    chargedCredits: '1.025',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe('safe resumable generation public contracts', () => {
    it('returns validated progress without artifacts or provider diagnostics', () => {
        expect(GenerationRunSummarySchema.parse(summary)).toEqual(summary);
        expect(
            GenerationRunSummarySchema.safeParse({
                ...summary,
                artifacts: [{ text: 'private source' }],
            }).success,
        ).toBe(false);

        expect(
            GenerationRunSummarySchema.safeParse({
                ...summary,
                error: 'raw provider response',
            }).success,
        ).toBe(false);
    });

    it('streams bounded persisted progress without leaking private artifacts', () => {
        const event = {
            id: 1,
            conversationId: summary.conversationId,
            createdAt: summary.updatedAt,
            type: 'generation-run',
            data: summary,
        };

        expect(ConversationEventSchema.parse(event)).toEqual(event);
        expect(
            ConversationEventSchema.parse({
                ...event,
                data: { ...summary, artifacts: [{ text: 'private' }] },
            }),
        ).toEqual(event);
    });

    it('rejects contradictory action, publication and progress states', () => {
        for (const patch of [
            { completedTaskCount: 2 },
            { totalTaskCount: 3 },
            { activeTurnId: randomUUID() },
            { proposalId: randomUUID() },
            {
                state: 'completed',
                pauseReason: undefined,
                proposalId: randomUUID(),
            },
            { state: 'running', pauseReason: undefined },
        ]) {
            expect(
                GenerationRunSummarySchema.safeParse({ ...summary, ...patch })
                    .success,
            ).toBe(false);
        }
    });

    it('requires idempotent revision fencing and keeps applying a revision separate from paid continuation', () => {
        const mutation = { requestId: randomUUID(), expectedRevision: 2 };
        expect(
            ContinueGenerationRunRequestSchema.parse({
                ...mutation,
                confirmedQuoteId: randomUUID(),
                sourceChoice: 'keep-snapshot',
            }).expectedRevision,
        ).toBe(2);

        expect(
            ContinueGenerationRunRequestSchema.safeParse({
                expectedRevision: 2,
            }).success,
        ).toBe(false);

        expect(
            ContinueGenerationRunRequestSchema.safeParse({
                ...mutation,
                expectedRevision: 0,
            }).success,
        ).toBe(false);

        expect(
            ApplyGenerationPlanRevisionRequestSchema.safeParse({
                ...mutation,
                candidateId: randomUUID(),
                confirmedQuoteId: randomUUID(),
            }).success,
        ).toBe(false);
    });

    it('requires a disjoint exhaustive revision summary', () => {
        const candidate = {
            id: randomUUID(),
            baseRevision: 1,
            plan: {
                schemaVersion: 1,
                replyLanguage: 'en',
                sources: [],
                tasks: [
                    {
                        id: 'reading',
                        kind: 'prose',
                        instruction: 'Read.',
                        language: 'fr',
                        inputs: [],
                    },
                ],
                outputOrder: ['reading'],
            },
            keptTaskIds: ['reading'],
            changedTaskIds: [],
            addedTaskIds: [],
            removedTaskIds: ['grammar'],
        };

        expect(GenerationPlanRevisionCandidateSchema.parse(candidate)).toEqual(
            candidate,
        );

        expect(
            GenerationPlanRevisionCandidateSchema.safeParse({
                ...candidate,
                changedTaskIds: ['reading'],
            }).success,
        ).toBe(false);

        expect(
            GenerationPlanRevisionCandidateSchema.safeParse({
                ...candidate,
                keptTaskIds: [],
            }).success,
        ).toBe(false);
    });

    it('rejects a readback that attaches another plan to run progress', () => {
        const detail = {
            run: summary,
            plan: {
                schemaVersion: 1,
                replyLanguage: 'en',
                sources: [],
                tasks: [
                    {
                        id: 'reading',
                        kind: 'prose',
                        instruction: 'Read.',
                        language: 'fr',
                        inputs: [],
                    },
                ],
                outputOrder: ['reading'],
            },
        };

        expect(GenerationRunDetailSchema.safeParse(detail).success).toBe(false);
    });

    it('requires retained plans for live runs and prohibits private plans on discarded tombstones', () => {
        const discarded = {
            ...summary,
            state: 'discarded',
            pauseReason: undefined,
            tasks: summary.tasks.map((task) => ({ ...task, label: task.kind })),
        };
        const plan = {
            schemaVersion: 1,
            replyLanguage: 'en',
            sources: [],
            tasks: [
                {
                    id: 'reading',
                    kind: 'prose',
                    instruction: 'Private user requirements.',
                    language: 'fr',
                    inputs: [],
                },
            ],
            outputOrder: ['reading'],
        };

        expect(GenerationRunDetailSchema.parse({ run: discarded })).toEqual({
            run: discarded,
        });

        expect(
            GenerationRunDetailSchema.safeParse({ run: summary }).success,
        ).toBe(false);

        expect(
            GenerationRunDetailSchema.safeParse({ run: discarded, plan })
                .success,
        ).toBe(false);

        expect(
            GenerationRunDetailSchema.safeParse({
                run: discarded,
                revisionCandidate: {
                    id: randomUUID(),
                    baseRevision: 1,
                    plan,
                    keptTaskIds: ['reading'],
                    changedTaskIds: [],
                    addedTaskIds: [],
                    removedTaskIds: [],
                },
            }).success,
        ).toBe(false);

        expect(
            GenerationRunSummarySchema.safeParse({
                ...discarded,
                tasks: summary.tasks,
            }).success,
        ).toBe(false);
    });
});
