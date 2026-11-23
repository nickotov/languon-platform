import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { LearningContentBrief } from '../../application/learning-content-contract';
import type {
    GenerationAttemptEvent,
    GenerationUnitAttempt,
} from '../../application/ports/generation-run';
import {
    createLearningContentAuthoring,
    type LearningContentModelCall,
} from './learning-content-authoring';
import { TutorStructuredOutputError } from './tutor-request-agents';

const reading = {
    id: 'reading',
    kind: 'prose',
    instruction: 'Write a reading.',
    language: 'fr',
} as const;
const grammar = {
    id: 'grammar',
    kind: 'grammar',
    instruction: 'Explain pronouns.',
    language: 'fr',
    explanationLanguage: 'fr',
} as const;
const rule = {
    type: 'grammar',
    id: randomUUID(),
    language: 'fr',
    rule: 'Le pronom remplace le complément.',
};
const run = { runId: randomUUID(), revision: 1 };
const brief: LearningContentBrief = {
    tasks: [reading, grammar],
    outputOrder: ['reading', 'grammar'],
};
const signal = new AbortController().signal;

function evidence(events: GenerationAttemptEvent[]): GenerationUnitAttempt[] {
    const latest = new Map(events.map((event) => [event.validationId, event]));

    return [...latest.values()].map((event) => ({
        ...event,
        turnId: randomUUID(),
        recordedAt: new Date().toISOString(),
        sourceHash: 'frozen',
    }));
}

describe('durable learning-unit recovery', () => {
    it('restores the next distinct strategy after each stage and publishes one complete ordered result', async () => {
        const events: GenerationAttemptEvent[] = [];
        const checkpoints: string[] = [];
        const receipts: string[] = [];
        const options = {
            run,
            onValidatedBatch: async ({
                results,
            }: {
                results: { taskId: string }[];
            }) => {
                checkpoints.push(...results.map((result) => result.taskId));
            },
            onCallRejected: async (id: string) => {
                receipts.push(id);
            },
            onGenerationAttempt: async (event: GenerationAttemptEvent) => {
                if (event.outcome === 'rejected') {
                    expect(receipts).toContain(event.validationId);
                }

                events.push(event);
            },
        };

        for (const strategy of ['initial', 'repair']) {
            let calls = 1;
            const result = await createLearningContentAuthoring({
                ...options,
                unitAttempts: evidence(events),
                readBudget: () => ({
                    remainingCalls: calls,
                    remainingOutputTokens: 10000,
                }),
                generate: async () => {
                    calls--;

                    throw new TutorStructuredOutputError('invalid-output');
                },
            }).generate(brief, signal);

            expect(result.status).toBe('paused');
            expect(events.at(-1)).toMatchObject({
                outcome: 'rejected',
                strategy,
                taskId: 'reading',
            });
        }

        const prose = [
            { kind: 'paragraph', text: 'Les citoyens participent au débat.' },
        ];
        const generate = vi.fn(async (call: LearningContentModelCall) => {
            if (events.at(-1)?.taskId === 'grammar') {
                return { tasks: [{ taskId: 'grammar', blocks: [rule] }] };
            }

            expect(call.prompt).toContain(
                'Independent compact authoring strategy',
            );

            expect(call.schema.safeParse({ item: prose }).success).toBe(true);
            expect(call.schema.safeParse({ tasks: [] }).success).toBe(false);

            return { item: prose };
        });
        const final = await createLearningContentAuthoring({
            ...options,
            unitAttempts: evidence(events),
            generate,
        }).generate(brief, signal);

        expect(final.status).toBe('ready');
        expect(checkpoints).toEqual(['reading', 'grammar']);
        expect(
            events
                .filter(
                    (event) =>
                        event.taskId === 'reading' &&
                        event.outcome === 'started',
                )
                .map((event) => event.strategy),
        ).toEqual(['initial', 'repair', 'fallback']);
    });

    it('finishes an independent branch after exhaustion, skips its failed sibling’s dependents, and fences replay', async () => {
        const events: GenerationAttemptEvent[] = [];
        const checkpoints: string[] = [];
        const tasks: LearningContentBrief = {
            tasks: [
                reading,
                {
                    ...grammar,
                    id: 'dependent',
                    dependencies: [reading.id],
                    source: { kind: 'task', taskId: reading.id },
                },
                grammar,
            ],
        };
        const options = {
            run,
            readBudget: () => ({
                remainingCalls: 5,
                remainingOutputTokens: 10000,
            }),
            onValidatedBatch: async ({
                results,
            }: {
                results: { taskId: string }[];
            }) => {
                checkpoints.push(...results.map((item) => item.taskId));
            },
            onGenerationAttempt: async (event: GenerationAttemptEvent) => {
                events.push(event);
            },
            generate: vi.fn(async () => {
                if (events.at(-1)?.taskId === reading.id) {
                    throw new TutorStructuredOutputError('invalid-output');
                }

                return { tasks: [{ taskId: grammar.id, blocks: [rule] }] };
            }),
        };
        const first = await createLearningContentAuthoring(options).generate(
            tasks,
            signal,
        );

        expect(first).toMatchObject({
            status: 'failed',
            diagnostic: { recoveryExhausted: true, taskId: reading.id },
        });

        expect(checkpoints).toEqual([grammar.id]);
        const replay = vi.fn();
        const second = await createLearningContentAuthoring({
            ...options,
            completedTaskIds: [grammar.id],
            unitAttempts: evidence(
                events.filter((e) => e.taskId === reading.id),
            ),
            generate: replay,
        }).generate(tasks, signal);

        expect(second).toMatchObject({
            status: 'failed',
            diagnostic: { recoveryExhausted: true, taskId: reading.id },
        });

        expect(replay).not.toHaveBeenCalled();
    });
});
