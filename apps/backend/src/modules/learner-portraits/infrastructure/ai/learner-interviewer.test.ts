import {
    textAiModelCatalog,
    type TextAiExecutionSnapshot,
} from '../../../text-ai/application/text-ai-provider-catalog';
import { runPinnedFallback } from '../../../text-ai/infrastructure/ai/run-pinned-fallback';
import { describe, expect, it } from 'vitest';
import { createLearnerInterviewerRunner } from './learner-interviewer';
import {
    interviewInputTokenLimit,
    buildInterviewSchemaInstruction,
    readInterviewInputTokenLimit,
} from './interview-request';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
} from '../../../conversations/infrastructure/ai/tutor-test-fixtures';
import {
    PortraitInterviewInvalidModelOutputError,
    type ClaimedInterviewOperation,
} from '../../application/ports/interview-store';
const operation: ClaimedInterviewOperation = {
    id: 'id',
    interviewId: 'interview',
    ownerId: 'owner',
    generation: 0,
    version: 0,
    state: 'running',
    input: { kind: 'chat', topic: 'goals', text: 'I want to travel' },
    context: {
        locale: 'en',
        approvedItems: null,
        draftItems: null,
        messages: [],
        completedTopics: ['languages'],
    },
    execution: {},
    result: null,
    errorCode: null,
    leaseToken: 'lease',
};
const result = {
    message: 'Which situations matter most?',
    topic: 'goals',
    options: [{ id: 'travel', label: 'Travel' }],
    multiSelect: true,
    answerSummary: 'Travel comfortably',
};
function pinnedInterviewSnapshot(): TextAiExecutionSnapshot {
    const model = textAiModelCatalog.find(
        (model) => model.id === 'deepseek-flash',
    )!;
    const other = textAiModelCatalog.find(
        (model) => model.id === 'qwen/qwen3.5-flash-02-23',
    )!;
    const primary: TextAiExecutionSnapshot = {
        ...model,
        modelId: model.id,
        supportedFormats: [...model.supportedFormats],
        enabledModelIds: [model.id, other.id],
    };
    const secondary: TextAiExecutionSnapshot = {
        ...other,
        modelId: other.id,
        supportedFormats: [...other.supportedFormats],
        enabledModelIds: [model.id, other.id],
    };
    const price = {
        id: '00000000-0000-4000-8000-000000000001',
        providerId: model.providerId,
        modelId: model.id,
        meter: 'text-tokens' as const,
        inputUsdPerMillionTokens: '0.1',
        outputUsdPerMillionTokens: '0.5',
        cacheReadUsdPerMillionTokens: null,
        cacheWriteUsdPerMillionTokens: null,
        usdPer1000Characters: null,
        effectiveAt: '2026-01-01T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: null,
        version: 1,
        sourceReference: 'synthetic',
        sourceUrl: null,
        reason: 'Synthetic regression price',
    };
    return {
        ...primary,
        routingAuthority: {
            revisionId: 'revision',
            flowId: 'portrait-interview',
            automaticReattemptLimit: 1,
            tariffPublished: true,
            candidates: [
                {
                    routeId: 'deepseek/deepseek-flash',
                    fingerprint: 'first',
                    snapshot: primary,
                    providerPrice: price,
                },
                {
                    routeId: `openrouter/${other.id}`,
                    fingerprint: 'second',
                    snapshot: secondary,
                    providerPrice: {
                        ...price,
                        providerId: other.providerId,
                        modelId: other.id,
                    },
                },
            ],
        },
    };
}

describe('learner interviewer runner', () => {
    it('settles a completed malformed answer unsuccessful before using the pinned fallback for a valid portrait', async () => {
        const primary = scriptedTutorModel(['not valid JSON']);
        const alternative = scriptedTutorModel([JSON.stringify(result)]);
        const accounting = tutorAccountingFixture();
        const used: string[] = [];
        const response = await runPinnedFallback({
            snapshot: pinnedInterviewSnapshot(),
            signal: new AbortController().signal,
            hasPublished: () => false,
            execute: async (snapshot, attempt) => {
                used.push(snapshot.modelId);
                if (attempt === 2) {
                    expect(accounting.fail).toHaveBeenCalledOnce();
                    expect(accounting.fail.mock.calls[0]?.[2]).toMatchObject({
                        inputTokens: 50,
                        outputTokens: 12,
                    });
                    expect(accounting.settle).not.toHaveBeenCalled();
                }
                return createLearnerInterviewerRunner({
                    model: attempt === 1 ? primary.model : alternative.model,
                    providerId: snapshot.providerId,
                    accounting,
                    maxInputTokens: 64000,
                }).run({ operation, signal: new AbortController().signal });
            },
        });
        expect(response).toEqual(result);
        expect(used).toEqual(['deepseek-flash', 'qwen/qwen3.5-flash-02-23']);
        expect(primary.requests).toHaveLength(1);
        expect(alternative.requests).toHaveLength(1);
        expect(accounting.admit).toHaveBeenCalledTimes(2);
        expect(accounting.fail).toHaveBeenCalledOnce();
        expect(accounting.settle).toHaveBeenCalledOnce();
        expect(accounting.fail.mock.calls[0]![0].callId).not.toBe(
            accounting.settle.mock.calls[0]![0].callId,
        );
    });
    it.each(['second-invalid', 'settlement-failed'] as const)(
        'cannot inflate a learner charge or issue a third request after %s',
        async (kind) => {
            const primary = scriptedTutorModel(['not JSON']);
            const secondary = scriptedTutorModel(['also not JSON']);
            const accounting = tutorAccountingFixture();
            if (kind === 'settlement-failed')
                accounting.fail.mockRejectedValueOnce(
                    new Error('Numerical settlement unavailable'),
                );
            const attempted: number[] = [];
            const response = runPinnedFallback({
                snapshot: pinnedInterviewSnapshot(),
                signal: new AbortController().signal,
                hasPublished: () => false,
                execute: async (snapshot, attempt) => {
                    attempted.push(attempt);
                    return createLearnerInterviewerRunner({
                        model: attempt === 1 ? primary.model : secondary.model,
                        providerId: snapshot.providerId,
                        accounting,
                        maxInputTokens: 64000,
                    }).run({ operation, signal: new AbortController().signal });
                },
            });
            if (kind === 'settlement-failed')
                await expect(response).rejects.toThrow(
                    'Numerical settlement unavailable',
                );
            else
                await expect(response).rejects.toBeInstanceOf(
                    PortraitInterviewInvalidModelOutputError,
                );
            expect(attempted).toEqual(
                kind === 'settlement-failed' ? [1] : [1, 2],
            );
            expect(accounting.settle).not.toHaveBeenCalled();
            expect(accounting.fail).toHaveBeenCalledTimes(
                kind === 'settlement-failed' ? 1 : 2,
            );
            expect(secondary.requests).toHaveLength(
                kind === 'settlement-failed' ? 0 : 1,
            );
        },
    );

    it('does not route around a provider content refusal even when its output is invalid JSON', async () => {
        const primary = scriptedTutorModel(['Request refused']);
        const generate = primary.model.doGenerate.bind(primary.model);
        const stream = primary.model.doStream.bind(primary.model);
        primary.model.doGenerate = async (options) => ({
            ...(await generate(options)),
            finishReason: 'content-filter',
        });
        primary.model.doStream = async (options) => {
            const response = await stream(options);
            return {
                ...response,
                stream: response.stream.pipeThrough(
                    new TransformStream({
                        transform(part, controller) {
                            controller.enqueue(
                                part.type === 'finish'
                                    ? {
                                          ...part,
                                          finishReason: 'content-filter',
                                      }
                                    : part,
                            );
                        },
                    }),
                ),
            };
        };
        const accounting = tutorAccountingFixture();
        const calls: number[] = [];
        await expect(
            runPinnedFallback({
                snapshot: pinnedInterviewSnapshot(),
                signal: new AbortController().signal,
                hasPublished: () => false,
                execute: async (snapshot, attempt) => {
                    calls.push(attempt);
                    return createLearnerInterviewerRunner({
                        model: primary.model,
                        providerId: snapshot.providerId,
                        accounting,
                        maxInputTokens: 64000,
                    }).run({ operation, signal: new AbortController().signal });
                },
            }),
        ).rejects.toBeInstanceOf(PortraitInterviewInvalidModelOutputError);
        expect(calls).toEqual([1]);
        expect(primary.requests).toHaveLength(1);
        expect(accounting.settle).not.toHaveBeenCalled();
        expect(accounting.fail).toHaveBeenCalledOnce();
    });

    it.each([429, 503])(
        'retains conclusive versus ambiguous provider evidence through the real SDK (%s)',
        async (statusCode) => {
            const provider = scriptedTutorModel([]);
            const rejection = Object.assign(new Error('Synthetic rejection'), {
                statusCode,
            });
            provider.model.doGenerate = async () => {
                throw rejection;
            };
            provider.model.doStream = async () => {
                throw rejection;
            };
            const accounting = tutorAccountingFixture();
            await expect(
                createLearnerInterviewerRunner({
                    model: provider.model,
                    providerId: 'openrouter',
                    accounting,
                    maxInputTokens: 64000,
                }).run({ operation, signal: new AbortController().signal }),
            ).rejects.toMatchObject({
                name: 'ProviderExecutionError',
                executionOutcome: statusCode === 429 ? 'rejected' : 'ambiguous',
            });
            expect(accounting.fail).toHaveBeenCalledOnce();
            expect(accounting.settle).not.toHaveBeenCalled();
        },
    );

    it.each(['small', 'unicode-history'] as const)(
        'bounds the actual provider envelope for %s without reserving the model context window',
        async (kind) => {
            const current =
                kind === 'small'
                    ? operation
                    : {
                          ...operation,
                          input: {
                              kind: 'chat' as const,
                              topic: 'goals' as const,
                              text: '日本語\\"🙂'.repeat(80),
                          },
                          context: {
                              ...operation.context,
                              messages: Array.from({ length: 8 }, () => ({
                                  role: 'user' as const,
                                  content: 'Türkçe Magyar 日本語\\"🙂'.repeat(
                                      50,
                                  ),
                              })),
                          },
                      };
            const limit = interviewInputTokenLimit(current, 64000);
            const accounting = tutorAccountingFixture();
            const provider = scriptedTutorModel([JSON.stringify(result)]);
            await createLearnerInterviewerRunner({
                model: provider.model,
                accounting,
                maxInputTokens: limit,
            }).run({
                operation: current,
                signal: new AbortController().signal,
            });
            expect(
                accounting.admit.mock.calls[0]![0].inputTokenEstimate,
            ).toBeLessThanOrEqual(limit);
            expect(limit).toBeLessThan(64000);
            const actual = Buffer.byteLength(
                JSON.stringify({
                    prompt: provider.requests[0]!.prompt,
                    tools: provider.requests[0]!.tools,
                }),
                'utf8',
            );
            expect(accounting.admit.mock.calls[0]![0].inputTokenEstimate).toBe(
                actual,
            );
            expect(actual).toBeLessThanOrEqual(limit);
            const userMessage = provider.requests[0]!.prompt.find(
                (message) => message.role === 'user',
            );
            expect(userMessage?.content).toContainEqual({
                type: 'text',
                text: buildInterviewSchemaInstruction(),
            });
            expect(JSON.stringify(provider.requests[0]!.prompt)).toContain(
                'proposedItems',
            );
            expect(JSON.stringify(provider.requests[0]!.prompt)).toContain(
                'just-starting',
            );
            if (kind === 'small') expect(limit).toBeLessThan(5900);
        },
    );
    it('preserves the full historical bound for old operations and rejects invalid new pins', () => {
        const execution = { snapshot: { perCallMaxInputTokens: 64000 } };
        expect(readInterviewInputTokenLimit(execution as never)).toBe(64000);
        for (const limit of [0, -1, 64001, 1.5, NaN]) {
            expect(() =>
                readInterviewInputTokenLimit({
                    ...execution,
                    interviewInputTokenLimit: limit,
                } as never),
            ).toThrow();
        }
    });
    it('rejects a provider envelope above its pin before admission or dispatch', async () => {
        const accounting = tutorAccountingFixture();
        const provider = scriptedTutorModel([JSON.stringify(result)]);
        await expect(
            createLearnerInterviewerRunner({
                model: provider.model,
                accounting,
                maxInputTokens: 1,
            }).run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(accounting.admit).not.toHaveBeenCalled();
        expect(provider.requests).toHaveLength(0);
    });
    it('registers an operation-only tool-free agent, validates output and accounts the provider request', async () => {
        const provider = scriptedTutorModel([JSON.stringify(result)]);
        const accounting = tutorAccountingFixture();
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 64000,
        });
        expect(
            await runner.run({
                operation,
                signal: new AbortController().signal,
            }),
        ).toEqual(result);
        expect(accounting.admit).toHaveBeenCalledOnce();
        expect(accounting.settle).toHaveBeenCalledOnce();
        expect(provider.requests).toHaveLength(1);
        const request = JSON.stringify(provider.requests[0]);
        expect(request).toContain('explanation-languages');
        expect(request).toContain(
            'Return your response as JSON matching this schema',
        );
        expect(provider.requests[0]?.toolChoice).toEqual({ type: 'none' });
        expect(request).toContain('never claim access');
        expect(provider.requests[0]?.tools ?? []).toHaveLength(0);
    });
    it('rejects over-limit answer proposals without repair or a second paid call', async () => {
        const provider = scriptedTutorModel([
            JSON.stringify({ ...result, answerSummary: 'a'.repeat(201) }),
        ]);
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(provider.requests).toHaveLength(1);
    });
    it('rejects an external redirect and invented output fields', async () => {
        const provider = scriptedTutorModel([
            JSON.stringify({
                ...result,
                redirect: 'https://example.com',
                useEnabled: true,
            }),
        ]);
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
    });
    it('rejects diagnostic labels in reusable proposed items', async () => {
        const provider = scriptedTutorModel([
            JSON.stringify({
                ...result,
                proposedItems: {
                    languages: [],
                    explanationLanguages: [],
                    goals: [],
                    accommodations: ['ADHD'],
                    hobbies: [],
                },
            }),
        ]);
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting: tutorAccountingFixture(),
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(provider.requests).toHaveLength(1);
    });
    it.each([
        ['non-JSON', 'This is a natural language reply'],
        ['malformed JSON', '{"message":'],
        [
            'markdown-wrapped JSON',
            `\`\`\`json\n${JSON.stringify(result)}\n\`\`\``,
        ],
        [
            'non-ASCII option id',
            JSON.stringify({
                ...result,
                options: [{ id: 'русский', label: 'Русский' }],
            }),
        ],
        [
            'nested invalid preference',
            JSON.stringify({
                ...result,
                proposedItems: {
                    languages: [
                        { language: 'en', learning: true, level: 'assessed' },
                    ],
                },
            }),
        ],
        [
            'duplicate option ids',
            JSON.stringify({
                ...result,
                options: [
                    { id: 'travel', label: 'A' },
                    { id: 'travel', label: 'B' },
                ],
            }),
        ],
    ])(
        'fails %s safely after exactly one accounted provider call',
        async (_label, response) => {
            const provider = scriptedTutorModel([response]);
            const accounting = tutorAccountingFixture();
            const runner = createLearnerInterviewerRunner({
                model: provider.model,
                accounting,
                maxInputTokens: 64000,
            });
            const failure = await runner
                .run({ operation, signal: new AbortController().signal })
                .catch((error: unknown) => error);
            expect(failure).toBeInstanceOf(
                PortraitInterviewInvalidModelOutputError,
            );
            expect((failure as Error).message).toBe(
                'The interview response did not match the required format.',
            );
            expect(failure).not.toHaveProperty('cause');
            expect(provider.requests).toHaveLength(1);
            expect(accounting.admit).toHaveBeenCalledOnce();
            expect(accounting.settle).not.toHaveBeenCalled();
            expect(accounting.fail).toHaveBeenCalledOnce();
            expect(accounting.fail.mock.calls[0]?.[1]).toBe('provider-error');
            expect(accounting.fail.mock.calls[0]?.[2]).toMatchObject({
                inputTokens: 50,
                outputTokens: 12,
            });
        },
    );
    it('returns a strict structured object with supported nested preferences', async () => {
        const expected = {
            ...result,
            proposedItems: {
                languages: [{ language: 'en', learning: true, level: 'basic' }],
                explanationLanguages: ['ru'],
                goals: ['Travel'],
                accommodations: ['Short steps'],
                hobbies: [],
            },
        };
        const provider = scriptedTutorModel([JSON.stringify(expected)]);
        const accounting = tutorAccountingFixture();
        await expect(
            createLearnerInterviewerRunner({
                model: provider.model,
                accounting,
                maxInputTokens: 64000,
            }).run({ operation, signal: new AbortController().signal }),
        ).resolves.toEqual(expected);
        expect(provider.requests).toHaveLength(1);
    });
    it('dispatches the exact admitted affordable output cap', async () => {
        const provider = scriptedTutorModel([JSON.stringify(result)]);
        const accounting = tutorAccountingFixture();
        await createLearnerInterviewerRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 64000,
            maxOutputTokens: 3261,
        }).run({ operation, signal: new AbortController().signal });
        expect(provider.requests[0]?.maxOutputTokens).toBe(3261);
        expect(accounting.admit.mock.calls[0]?.[0].maxOutputTokens).toBe(3261);
    });
    it('does not dispatch when accounting admission fails', async () => {
        const provider = scriptedTutorModel([JSON.stringify(result)]);
        const accounting = tutorAccountingFixture();
        accounting.admit.mockRejectedValue(new Error('credits_exhausted'));
        const runner = createLearnerInterviewerRunner({
            model: provider.model,
            accounting,
            maxInputTokens: 64000,
        });
        await expect(
            runner.run({ operation, signal: new AbortController().signal }),
        ).rejects.toThrow();
        expect(provider.requests).toHaveLength(0);
    });
});
