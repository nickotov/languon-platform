import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { KnowledgeBody } from '@languon/contracts';
import type { GenerationExecutionContext } from '../../application/ports/generation-run';
import {
    generationAdmissionInput,
    prospectiveLessonCalls,
} from './generation-admission-input';
import { createLearningContentAuthoring } from './learning-content-authoring';
import { restoreGenerationExecution } from './learning-generation-plan';
import {
    createTutorRequestAgents,
    generateTutorObject,
} from './tutor-request-agents';
import { scriptedTutorModel } from './tutor-test-fixtures';

const prose = (text: string): KnowledgeBody => ({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
});

function lesson(material: string): GenerationExecutionContext {
    const reading = {
        id: randomUUID(),
        taskId: 'reading',
        revision: 1,
        batchKey: 'completed',
        taskComplete: true,
        validationVersion: 'learning-content-v1',
        requirementsHash: '',
        sourceHash: '',
        contentHash: '',
        body: prose(material),
    };

    return {
        runId: randomUUID(),
        revision: 1,
        purpose: 'generation',
        plan: {
            schemaVersion: 1,
            replyLanguage: 'en',
            tasks: [
                {
                    id: 'reading',
                    kind: 'prose',
                    language: 'fr',
                    instruction: 'Write a reading.',
                    inputs: [],
                },
                {
                    id: 'grammar',
                    kind: 'grammar',
                    language: 'fr',
                    explanationLanguage: 'fr',
                    instruction: 'Explain agreement.',
                    inputs: [],
                },
            ],
            outputOrder: ['reading', 'grammar'],
            sources: [],
        },
        sources: [],
        artifacts: [reading],
    };
}

describe('prepared generation input admission', () => {
    it('admits the native call under its ceiling even when unrelated checkpoint history exceeds it', async () => {
        const context = lesson('Unrelated archived source '.repeat(2900));
        const bound = generationAdmissionInput(context, 'Continue');
        expect(JSON.stringify(context).length).toBeGreaterThan(64000);
        expect(bound).toEqual(
            generationAdmissionInput(lesson('Short.'), 'Continue'),
        );

        expect(bound.minimumInputBound).toBeLessThan(64000);
        const output = {
            tasks: [
                {
                    taskId: 'grammar',
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            rule: 'Accord du participe.',
                            language: 'fr',
                        },
                    ],
                },
            ],
        };
        const provider = scriptedTutorModel([JSON.stringify(output)]);
        const agents = createTutorRequestAgents({
            planningModel: provider.model,
            authoringModel: provider.model,
        });
        const restored = restoreGenerationExecution(context);
        const result = await createLearningContentAuthoring({
            ...restored,
            run: { runId: context.runId, revision: 1 },
            generate: (call) =>
                generateTutorObject({
                    agent: agents.learningContentAuthor,
                    ...call,
                    operationId: 'synthetic-projection',
                }),
        }).generate(restored.brief, new AbortController().signal);

        expect(provider.requests).toHaveLength(1);
        const { prompt, tools } = provider.requests[0]!;
        const actual = Buffer.byteLength(
            JSON.stringify({ prompt, tools }),
            'utf8',
        );

        expect(bound.minimumInputBound).toBeGreaterThanOrEqual(actual);
        expect(bound.minimumInputBound - actual).toBeLessThan(16);
        expect(JSON.stringify(prompt)).not.toContain(
            'Unrelated archived source',
        );

        expect(result.status).toBe('ready');
    });

    it('counts the complete UTF-8 and JSON escaped content of an actual dependency', () => {
        const context = lesson('é\\'.repeat(12500));
        context.plan.tasks[1]!.inputs = [{ kind: 'task', taskId: 'reading' }];
        expect(
            generationAdmissionInput(context, 'Continue').minimumInputBound,
        ).toBeGreaterThan(64000);
    });

    it('hands off a saved plan or unit before a wider call is dispatched', async () => {
        const context = lesson('unused');
        context.plan.tasks[1]!.inputs = [{ kind: 'task', taskId: 'reading' }];
        context.artifacts = [];
        const restored = restoreGenerationExecution(context);
        const run = { runId: context.runId, revision: 1 };
        const bound = generationAdmissionInput(
            context,
            'continue',
        ).minimumInputBound;
        let calls = 0;
        const generate = async () => {
            calls++;

            return {
                tasks: [
                    {
                        taskId: 'reading',
                        prose: [
                            {
                                kind: 'paragraph',
                                text: 'Exact supporting material. '.repeat(
                                    1200,
                                ),
                            },
                        ],
                    },
                ],
            };
        };
        const staged = {
            ...restored,
            run,
            generate,
            onValidatedBatch: async () => {},
        };
        const budget = (perCallInputLimit: number) => () => ({
            remainingCalls: 5,
            remainingOutputTokens: 10000,
            perCallInputLimit,
        });
        const signal = new AbortController().signal;
        const afterPlanner = await createLearningContentAuthoring({
            ...staged,
            planCreatedInStage: true,
            readBudget: budget(bound - 1),
        }).generate(restored.brief, signal);

        expect(afterPlanner.status).toBe('paused');
        expect(calls).toBe(0);

        const afterReading = await createLearningContentAuthoring({
            ...staged,
            readBudget: budget(bound + 64),
        }).generate(restored.brief, signal);

        expect(afterReading.status).toBe('paused');
        expect(calls).toBe(1);
    });

    it('prices the same native request as admission and substitutes saved material for prospective dependencies', () => {
        const context = lesson('Un passage long. '.repeat(800));
        context.plan.tasks[1]!.inputs = [{ kind: 'task', taskId: 'reading' }];
        const completed = prospectiveLessonCalls(context);
        expect(completed).toHaveLength(1);
        expect(completed[0]!.requestBytes).toHaveLength(3);
        expect(completed[0]!.requestBytes[0]).toBe(
            generationAdmissionInput(context, 'Continue').minimumInputBound,
        );

        expect(completed[0]!.futureSourceTokens).toBe(0);
        const prospective = prospectiveLessonCalls({
            ...context,
            artifacts: [],
        });

        expect(prospective).toHaveLength(2);
        expect(prospective[1]!.futureSourceTokens).toBeGreaterThan(0);
        expect(prospective[1]!.requestBytes[0]).toBeLessThan(
            completed[0]!.requestBytes[0]!,
        );
    });

    it('sizes plan revisions from the plan and learner request only', () => {
        const context = lesson('Long checkpoint '.repeat(5000));
        context.purpose = 'revision';
        const initial = generationAdmissionInput(
            context,
            'Shorten the grammar.',
        );

        context.artifacts = [];
        expect(
            generationAdmissionInput(context, 'Shorten the grammar.'),
        ).toEqual(initial);

        expect(
            generationAdmissionInput(
                context,
                'Shorten the grammar. '.repeat(100),
            ).minimumInputBound,
        ).toBeGreaterThan(initial.minimumInputBound);
    });
});
