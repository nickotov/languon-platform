import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeExerciseEvaluationInput } from '../../application/ports/exercise-evaluation-store';
import type { KnowledgeExerciseEvaluationResult } from '@languon/contracts';
import {
    textAiExecutionLimits,
    textAiModelCatalog,
} from '../../../text-ai/application/text-ai-provider-catalog';
import { createTextsAiProvider } from '../../../texts/infrastructure/ai/texts-ai-provider';
import { segmentText } from '../../../texts/domain/text';
import { validateKnowledgeExerciseEvaluationResult } from './exercise-evaluation-provider';

afterEach(() => vi.unstubAllGlobals());

function input(): KnowledgeExerciseEvaluationInput {
    const id = randomUUID();

    return {
        noteId: id,
        noteOwnerId: id,
        attemptId: randomUUID(),
        noteVersion: 1,
        exerciseId: id,
        exerciseRevision: 'a'.repeat(64),
        learningEpoch: 1,
        semanticFingerprint: 'b'.repeat(64),
        answer: { format: 'free-text', text: 'I borrowed a library.' },
        sourcePassages: 'The target word is borrow: use something temporarily.',
        replyLanguage: 'en',
        grant: null,
        exercise: {
            id,
            type: 'exercise',
            format: 'free-text',
            question: 'Write a sentence about a library using borrow.',
            referenceAnswer: 'I borrowed a book from the library.',
            explanation: 'Use borrow with an object you temporarily use.',
            semantics: {
                activity: { id: 'V07', version: 1 },
                objective: 'Use borrow with its intended meaning.',
                format: 'free-text',
                language: 'en',
                explanationLanguage: 'en',
                checking: {
                    policy: 'ai-rubric',
                    rubric: {
                        criteria: [
                            {
                                dimension: 'task-completion',
                                requirement: 'Write the requested sentence.',
                            },
                            {
                                dimension: 'meaning',
                                requirement: 'Preserve the intended sense.',
                            },
                            {
                                dimension: 'target-use',
                                requirement: 'Use borrow naturally.',
                            },
                        ],
                    },
                },
                sources: [
                    {
                        kind: 'vocabulary',
                        origin: {
                            kind: 'proposal',
                            proposalId: randomUUID(),
                            blockId: randomUUID(),
                        },
                        entries: [
                            {
                                entryId: randomUUID(),
                                term: 'borrow',
                                sense: 'Use temporarily.',
                            },
                        ],
                    },
                ],
            },
        },
    };
}

function partialResult(): KnowledgeExerciseEvaluationResult {
    return {
        status: 'partially-correct',
        feedback:
            'The sentence uses the target verb but changes what is borrowed.',
        validAlternative: false,
        criteria: [
            {
                dimension: 'task-completion',
                status: 'met',
                feedback: 'A sentence is supplied.',
            },
            {
                dimension: 'meaning',
                status: 'partially-met',
                feedback: 'Borrow an object, not the library.',
            },
            {
                dimension: 'target-use',
                status: 'not-met',
                feedback: 'The object needs correction.',
            },
        ],
        corrections: ['Say that you borrowed a book from the library.'],
        suggestedAnswer: 'I borrowed a book from the library.',
    };
}

describe('named exercise AI evaluation boundary', () => {
    it('requires the exact task rubric and actionable feedback rather than an unqualified score', () => {
        const request = input();
        const result = partialResult();

        expect(
            validateKnowledgeExerciseEvaluationResult(request, result),
        ).toEqual(result);

        const { criteria: _criteria, ...withoutCriteria } = result;
        for (const patch of [
            { criteria: undefined },
            { criteria: result.criteria?.slice(0, 2) },
            { corrections: [] },
            { status: 'correct' },
            { validAlternative: true },
        ]) {
            expect(() =>
                validateKnowledgeExerciseEvaluationResult(request, {
                    ...result,
                    ...patch,
                }),
            ).toThrow();
        }

        expect(() =>
            validateKnowledgeExerciseEvaluationResult(request, withoutCriteria),
        ).toThrow();
    });

    it('represents lack of evidence as unassessed rather than wrong and keeps Custom feedback available', () => {
        const request = input();
        const result = {
            ...partialResult(),
            status: 'unable-to-assess',
            criteria: partialResult().criteria?.map((criterion) => ({
                ...criterion,
                status: 'unable-to-assess',
            })),
            corrections: [],
            feedback:
                'The supplied context does not establish the intended sense.',
        };

        expect(
            validateKnowledgeExerciseEvaluationResult(request, result).status,
        ).toBe('unable-to-assess');

        const { semantics: _semantics, ...custom } = request.exercise;
        expect(
            validateKnowledgeExerciseEvaluationResult(
                { ...request, exercise: custom },
                {
                    status: 'correct',
                    feedback: 'Valid.',
                    validAlternative: false,
                },
            ),
        ).toMatchObject({ status: 'correct' });
    });

    it.each([2_048, 512])(
        'preserves the real SDK output allowance %s and sends only explicit admitted evaluation',
        async (outputLimit) => {
            const model = textAiModelCatalog.find(
                (entry) => entry.id === 'deepseek-flash',
            )!;
            const result = partialResult();
            const transport = vi.fn<typeof fetch>(async (url) => {
                expect(String(url)).toBe(
                    'https://api.deepseek.com/chat/completions',
                );

                return new Response(
                    JSON.stringify({
                        id: 'synthetic-named-feedback',
                        object: 'chat.completion',
                        created: 1,
                        model: model.id,
                        choices: [
                            {
                                index: 0,
                                message: {
                                    role: 'assistant',
                                    content: JSON.stringify(result),
                                },
                                finish_reason: 'stop',
                            },
                        ],
                        usage: {
                            prompt_tokens: 120,
                            completion_tokens: 160,
                            total_tokens: 280,
                        },
                    }),
                    {
                        status: 200,
                        headers: { 'content-type': 'application/json' },
                    },
                );
            });

            vi.stubGlobal('fetch', transport);
            const sourceText = 'Borrow a book from the library.';
            const request = input();
            const budget = {
                ...model.aggregateBudget,
                maxOutputTokensPerAttempt: outputLimit,
            };
            const execution = {
                adapterRevision: model.adapterRevision,
                modelId: model.id,
                providerId: model.providerId,
                credentialReference: model.credentialReference,
                enabledModelIds: [model.id],
                supportedFormats: ['text-translation:v4'],
                aggregateBudget: budget,
                ...textAiExecutionLimits(model, ['text-translation:v4']),
            };
            const draft = await createTextsAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-evaluation-key' },
            }).run({
                input: {
                    kind: 'text-translation',
                    operationId: randomUUID(),
                    folderId: randomUUID(),
                    sourceText,
                    sourceLanguage: 'en',
                    targetLanguage: 'fr',
                    segments: segmentText(sourceText, 'en', randomUUID),
                    knowledgeExerciseEvaluation: request,
                },
                execution,
                budget,
                idempotencyKey: 'synthetic-named-evaluation',
                signal: new AbortController().signal,
            });

            expect(draft.draft).toEqual(result);
            expect(transport).toHaveBeenCalledTimes(1);
            const outgoing = JSON.parse(
                String(transport.mock.calls[0]?.[1]?.body),
            );

            expect(outgoing.max_tokens).toBe(outputLimit);
            expect(outgoing.tools).toBeUndefined();
            expect(outgoing.reasoning_effort).toBe('none');
            expect(JSON.stringify(outgoing.messages)).toContain(
                'Use borrow naturally.',
            );

            expect(JSON.stringify(outgoing.messages)).toContain(
                'I borrowed a library.',
            );
        },
    );
});
