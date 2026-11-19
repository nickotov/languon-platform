import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConversationEventSchema } from './contextual-assistant';
import {
    GenerationRunSummarySchema,
    ContinueGenerationRunRequestSchema,
    ApplyGenerationPlanRevisionRequestSchema,
    GenerationPlanRevisionCandidateSchema,
    GenerationRunDetailSchema,
    GenerationAutomationSchema,
    GenerationFailureSchema,
    GenerationTaskProgressSchema,
    StopGenerationRunRequestSchema,
} from './generation-runs';
import { GenerationRunPreviewSchema } from './generation-run-preview';

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
    it('exposes bounded unit progress without claiming a partial task complete', () => {
        const partial = {
            id: 'practice',
            kind: 'exercises',
            status: 'running',
            label: 'Grammar practice',
            completedUnitCount: 2,
            totalUnitCount: 4,
        };

        expect(GenerationTaskProgressSchema.parse(partial)).toEqual(partial);
        for (const patch of [
            { totalUnitCount: undefined },
            { completedUnitCount: undefined },
            { completedUnitCount: 5 },
            { status: 'completed' },
            { completedUnitCount: 4 },
            { totalUnitCount: 26 },
        ]) {
            expect(
                GenerationTaskProgressSchema.safeParse({ ...partial, ...patch })
                    .success,
            ).toBe(false);
        }

        expect(
            GenerationTaskProgressSchema.safeParse({
                ...partial,
                status: 'completed',
                completedUnitCount: 4,
            }).success,
        ).toBe(true);
    });

    it('allows safe failure categories and field paths while rejecting raw diagnostic data', () => {
        const failure = {
            code: 'schema-invalid',
            taskId: 'practice',
            paths: ['tasks.0.blocks.0.semantics.checking.key'],
        };

        expect(GenerationFailureSchema.parse(failure)).toEqual(failure);
        for (const patch of [
            { message: 'The original lesson text.' },
            { code: 'raw-provider-error' },
            { paths: ['tasks.0.blocks.0.secretAnswer'] },
            { paths: ['The learner wrote this private sentence.'] },
            { paths: ['tasks.10000.blocks'] },
            { paths: Array.from({ length: 9 }, () => 'tasks') },
        ]) {
            expect(
                GenerationFailureSchema.safeParse({ ...failure, ...patch })
                    .success,
            ).toBe(false);
        }

        const failed = {
            ...summary,
            pauseReason: 'technical-failure',
            failure: { ...failure, taskId: 'grammar' },
        };

        expect(GenerationRunSummarySchema.safeParse(failed).success).toBe(true);
        expect(
            GenerationRunSummarySchema.safeParse({ ...failed, failure })
                .success,
        ).toBe(false);

        expect(
            GenerationRunSummarySchema.safeParse({
                ...failed,
                state: 'running',
                pauseReason: undefined,
                activeTurnId: randomUUID(),
            }).success,
        ).toBe(false);
    });

    it('provides an opaque support reference for an unclassified failure without accepting raw error text', () => {
        const failure = { code: 'unknown', referenceId: randomUUID() };

        expect(GenerationFailureSchema.parse(failure)).toEqual(failure);
        expect(
            GenerationRunSummarySchema.safeParse({
                ...summary,
                pauseReason: 'technical-failure',
                failure,
            }).success,
        ).toBe(true);

        for (const patch of [
            { referenceId: 'the provider rejected the private prompt' },
            { referenceId: 123 },
            { message: 'raw provider response' },
            { stack: 'private diagnostic stack' },
        ]) {
            expect(
                GenerationFailureSchema.safeParse({ ...failure, ...patch })
                    .success,
            ).toBe(false);
        }
    });

    it('accepts only typed reasons on durable admission failures', () => {
        expect(
            GenerationFailureSchema.parse({
                code: 'admission-blocked',
                admissionReason: 'capacity',
            }).admissionReason,
        ).toBe('capacity');

        for (const failure of [
            { code: 'admission-blocked' },
            { code: 'provider-outcome-unknown', admissionReason: 'balance' },
            {
                code: 'admission-blocked',
                admissionReason: 'raw database exception',
            },
        ]) {
            expect(GenerationFailureSchema.safeParse(failure).success).toBe(
                false,
            );
        }
    });

    it('bounds automatic credit authority exactly and stops enabling it after actionable pauses', () => {
        const automation = {
            enabled: true,
            maximumCredits: '1.025',
            remainingCredits: '0.999',
        };

        expect(GenerationAutomationSchema.parse(automation)).toEqual(
            automation,
        );

        expect(
            GenerationAutomationSchema.safeParse({
                ...automation,
                maximumCredits: '0',
                remainingCredits: '0',
            }).success,
        ).toBe(true);

        for (const patch of [
            { remainingCredits: '1.026' },
            { remainingCredits: '-1' },
            { remainingCredits: 'invalid' },
            { maximumCredits: 'invalid' },
        ]) {
            expect(
                GenerationAutomationSchema.safeParse({
                    ...automation,
                    ...patch,
                }).success,
            ).toBe(false);
        }

        expect(
            GenerationRunSummarySchema.safeParse({ ...summary, automation })
                .success,
        ).toBe(true);

        for (const pauseReason of [
            'technical-failure',
            'stopped',
            'source-changed',
            'interrupted',
        ]) {
            expect(
                GenerationRunSummarySchema.safeParse({
                    ...summary,
                    pauseReason,
                    automation,
                }).success,
            ).toBe(false);
        }
    });

    it('returns only nonempty validated preview prefixes with unique task identities and bounded payloads', () => {
        const body = {
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Un texte préparé.' }],
                    },
                ],
            },
        };
        const part = {
            taskId: 'reading',
            body,
            completedUnitCount: 1,
            totalUnitCount: 1,
            complete: true,
        };
        const preview = { runId: summary.id, revision: 1, parts: [part] };

        expect(GenerationRunPreviewSchema.parse(preview)).toEqual(preview);
        expect(
            GenerationRunPreviewSchema.parse({ ...preview, parts: [] }).parts,
        ).toEqual([]);

        for (const patch of [
            { parts: [part, part] },
            { parts: [{ ...part, complete: false }] },
            { parts: [{ ...part, completedUnitCount: 0, complete: false }] },
            {
                parts: [
                    {
                        ...part,
                        body: {
                            schemaVersion: 2,
                            document: {
                                type: 'doc',
                                content: [{ type: 'script', text: 'unsafe' }],
                            },
                        },
                    },
                ],
            },
            { artifacts: [{ source: 'private' }] },
            {
                parts: [
                    {
                        ...part,
                        body: {
                            ...body,
                            document: {
                                type: 'doc',
                                content: [
                                    {
                                        type: 'paragraph',
                                        content: [
                                            {
                                                type: 'text',
                                                text: 'x'.repeat(100_000),
                                            },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
        ]) {
            expect(
                GenerationRunPreviewSchema.safeParse({ ...preview, ...patch })
                    .success,
            ).toBe(false);
        }
    });

    it('closes preview source references with frozen dependencies without exposing writer authority', () => {
        const audioId = randomUUID();
        const segmentId = randomUUID();
        const audio = {
            type: 'audio',
            id: audioId,
            assetId: randomUUID(),
            transcript: {
                language: 'fr',
                segments: [{ id: segmentId, text: 'Un chat dort.' }],
            },
        };
        const exercise = {
            type: 'exercise',
            id: randomUUID(),
            format: 'free-text',
            question: 'Qui dort ?',
            referenceAnswer: 'Un chat',
            explanation: 'Le texte nomme un chat.',
            source: { blockId: audioId, segmentIds: [segmentId] },
        };
        const preview = {
            runId: summary.id,
            revision: 1,
            parts: [
                {
                    taskId: 'practice',
                    completedUnitCount: 1,
                    totalUnitCount: 2,
                    complete: false,
                    body: {
                        schemaVersion: 2,
                        document: {
                            type: 'doc',
                            content: [
                                {
                                    type: 'learningBlock',
                                    attrs: { block: exercise },
                                },
                            ],
                        },
                    },
                },
            ],
        };

        expect(GenerationRunPreviewSchema.safeParse(preview).success).toBe(
            false,
        );

        expect(
            GenerationRunPreviewSchema.parse({
                ...preview,
                dependencies: [audio],
            }),
        ).toEqual({ ...preview, dependencies: [audio] });

        expect(
            GenerationRunPreviewSchema.safeParse({
                ...preview,
                dependencies: [audio],
                targetBlockId: audioId,
            }).success,
        ).toBe(false);

        expect(
            GenerationRunPreviewSchema.safeParse({
                ...preview,
                dependencies: [audio, audio],
            }).success,
        ).toBe(false);
    });

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
        expect(StopGenerationRunRequestSchema.parse(mutation)).toEqual(
            mutation,
        );

        expect(
            StopGenerationRunRequestSchema.safeParse({
                requestId: mutation.requestId,
            }).success,
        ).toBe(false);

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
