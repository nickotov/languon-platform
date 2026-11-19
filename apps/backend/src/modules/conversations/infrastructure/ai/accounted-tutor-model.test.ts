import { currentTextAiProviderAttemptWitness } from '../../../text-ai/infrastructure/ai/text-ai-provider-attempt-context';
import { describe, expect, it, vi } from 'vitest';
import { createTutorModelGate } from './accounted-tutor-model.js';
import {
    scriptedTutorModel,
    tutorAccountingFixture,
} from './tutor-test-fixtures.js';

const input = {
    prompt: [
        {
            role: 'user' as const,
            content: [{ type: 'text' as const, text: 'Explain the article.' }],
        },
    ],
};

describe('accounted tutor model', () => {
    it('requires exactly one settled response for the current validation', async () => {
        const gate = createTutorModelGate({
            accounting: tutorAccountingFixture(),
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const model = gate.wrap(
            scriptedTutorModel(['one', 'two', 'three']).model,
            'authoring',
        );

        await gate.withStructuredValidation('single', async () => {
            expect(gate.completedStructuredResponse('single')).toBeUndefined();
            await model.doGenerate(input);
        });

        expect(gate.completedStructuredResponse('single')).toBe('stop');

        await gate.withStructuredValidation('multiple', async () => {
            await model.doGenerate(input);
            await model.doGenerate(input);
        });

        expect(gate.completedStructuredResponse('multiple')).toBeUndefined();
    });

    it.each([
        'tool-calls',
        'content-filter',
        'error',
        'other',
        'unknown',
    ] as const)(
        'returns only the allowlisted terminal %s from the settled call',
        async (finishReason) => {
            const provider = scriptedTutorModel(['fixture']);
            const produce = provider.model.doGenerate.bind(provider.model);
            provider.model.doGenerate = async (options) => ({
                ...(await produce(options)),
                finishReason,
            });

            const gate = createTutorModelGate({
                accounting: tutorAccountingFixture(),
                signal: new AbortController().signal,
                maxInputTokens: 64000,
            });

            await gate.withStructuredValidation('single', () =>
                gate.wrap(provider.model, 'authoring').doGenerate(input),
            );

            expect(gate.completedStructuredResponse('single')).toBe(
                finishReason,
            );

            expect(
                gate.completedStructuredResponse('unrelated'),
            ).toBeUndefined();
        },
    );

    it('never accepts a structured response truncated by the provider', async () => {
        const accounting = {
            ...tutorAccountingFixture(),
            validateStructuredCall: vi.fn(async () => undefined),
        };
        const provider = scriptedTutorModel(['{"complete-looking":true}']);
        const generate = provider.model.doGenerate.bind(provider.model);
        provider.model.doGenerate = async (options) => ({
            ...(await generate(options)),
            finishReason: 'length',
        });

        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await gate.withStructuredValidation('truncated', () =>
            gate.wrap(provider.model, 'authoring').doGenerate(input),
        );

        expect(gate.completedStructuredResponse('truncated')).toBe('length');

        expect(gate.completedStructuredResponse('missing')).toBeUndefined();

        await expect(gate.acceptStructuredCall('truncated')).rejects.toThrow(
            'cannot be accepted',
        );

        expect(accounting.validateStructuredCall).not.toHaveBeenCalled();
        await gate.rejectStructuredCall('truncated');
        expect(
            accounting.validateStructuredCall,
        ).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ outputLimitReached: true }),
            { accepted: false },
        );
    });

    it('keeps structured provider completion provisional until explicit whole-call validation', async () => {
        const accounting = {
            ...tutorAccountingFixture(),
            validateStructuredCall: vi.fn(async () => undefined),
        };
        const provider = scriptedTutorModel([
            '{"valid":true}',
            '{"invalid":true}',
            'ordinary reply',
        ]);
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const model = gate.wrap(provider.model, 'authoring');

        await gate.withStructuredValidation('batch-1', () =>
            model.doGenerate(input),
        );

        expect(accounting.settle).toHaveBeenCalledTimes(1);
        expect(accounting.validateStructuredCall).not.toHaveBeenCalled();
        await gate.acceptStructuredCall('batch-1');
        expect(accounting.validateStructuredCall).toHaveBeenLastCalledWith(
            expect.objectContaining({ validationId: 'batch-1' }),
            { accepted: true },
        );

        await gate.withStructuredValidation('batch-2', () =>
            model.doGenerate(input),
        );

        await gate.rejectStructuredCall('batch-2');
        expect(accounting.validateStructuredCall).toHaveBeenLastCalledWith(
            expect.objectContaining({ validationId: 'batch-2' }),
            { accepted: false },
        );

        await gate.wrap(provider.model, 'answer').doGenerate(input);
        expect(
            accounting.admit.mock.calls[2]?.[0].validationId,
        ).toBeUndefined();

        expect(accounting.settle).toHaveBeenCalledTimes(3);
        expect(accounting.validateStructuredCall).toHaveBeenCalledTimes(2);
    });

    it('rejects an unbound validation and preserves validation identity across concurrent contexts', async () => {
        const accounting = {
            ...tutorAccountingFixture(),
            validateStructuredCall: vi.fn(async () => undefined),
        };
        const provider = scriptedTutorModel(['one', 'two']);
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const model = gate.wrap(provider.model, 'authoring');

        await expect(gate.acceptStructuredCall('missing')).rejects.toThrow(
            'no admitted call',
        );

        await Promise.all(
            ['one', 'two'].map((id) =>
                gate.withStructuredValidation(id, () =>
                    model.doGenerate(input),
                ),
            ),
        );

        await gate.acceptStructuredCall('two');
        expect(
            accounting.validateStructuredCall,
        ).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ validationId: 'two' }),
            { accepted: true },
        );

        expect(() =>
            gate.withStructuredValidation('one', () => model.doGenerate(input)),
        ).toThrow('must be unique');
    });

    it('reports the time left on the original stage deadline after a long call', async () => {
        const clock = vi.spyOn(Date, 'now');
        try {
            clock.mockReturnValue(1_000);
            const gate = createTutorModelGate({
                accounting: tutorAccountingFixture(),
                signal: new AbortController().signal,
                maxInputTokens: 32000,
                deadline: 121_000,
            });

            expect(gate.remainingBudget).toMatchObject({
                perCallInputLimit: 32000,
                remainingTimeMs: 120_000,
            });

            await gate
                .wrap(scriptedTutorModel(['ok']).model, 'authoring')
                .doGenerate(input);

            clock.mockReturnValue(120_000);
            expect(gate.remainingBudget.remainingTimeMs).toBe(1_000);
            clock.mockReturnValue(122_000);
            expect(gate.remainingBudget.remainingTimeMs).toBe(0);
        } finally {
            clock.mockRestore();
        }
    });

    it('exposes fresh immutable budget snapshots and reclaims measured unused output', async () => {
        const provider = scriptedTutorModel(['Explanation']);
        const gate = createTutorModelGate({
            accounting: tutorAccountingFixture(),
            signal: new AbortController().signal,
            maxInputTokens: 64000,
            maxCalls: 4,
        });
        const before = gate.remainingBudget;

        expect(before).toMatchObject({
            remainingCalls: 4,
            remainingOutputTokens: 10_000,
        });

        expect(Object.isFrozen(before)).toBe(true);
        expect(gate.remainingBudget).not.toBe(before);

        await gate.wrap(provider.model, 'authoring').doGenerate(input);

        expect(gate.remainingBudget).toMatchObject({
            remainingCalls: 3,
            remainingOutputTokens: 9988,
        });

        expect(before).toMatchObject({
            remainingCalls: 4,
            remainingOutputTokens: 10_000,
        });
    });

    it('retains failed calls with unknown usage in the available-budget snapshot', async () => {
        const provider = scriptedTutorModel([]);
        const gate = createTutorModelGate({
            accounting: tutorAccountingFixture(),
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await expect(
            gate.wrap(provider.model, 'authoring').doGenerate(input),
        ).rejects.toThrow('Unexpected model dispatch');

        expect(gate.remainingBudget).toMatchObject({
            remainingCalls: 4,
            remainingOutputTokens: 5904,
        });
    });

    it('keeps concurrent SDK dispatch witnesses bound to their admitted calls and clears them afterwards', async () => {
        let releaseStarted!: () => void;
        const bothStarted = new Promise<void>((resolve) => {
            releaseStarted = resolve;
        });
        let started = 0;
        const run = async (jobId: string) => {
            const provider = scriptedTutorModel(['Synthetic answer']);
            const original = provider.model.doGenerate.bind(provider.model);
            const accounting = tutorAccountingFixture();
            const observations: { jobId: string; attemptId: string }[] = [];
            provider.model.doGenerate = async (options) => {
                const before = currentTextAiProviderAttemptWitness();
                expect(before).toMatchObject({
                    jobId,
                    leaseToken: `lease-${jobId}`,
                });

                observations.push({
                    jobId: before!.jobId,
                    attemptId: before!.attemptId,
                });

                started += 1;
                if (started === 2) {
                    releaseStarted();
                }

                await bothStarted;
                await Promise.resolve();
                expect(currentTextAiProviderAttemptWitness()).toEqual(before);

                return original(options);
            };

            const gate = createTutorModelGate({
                accounting,
                signal: new AbortController().signal,
                maxInputTokens: 64000,
                attemptWitness: { jobId, leaseToken: `lease-${jobId}` },
            });

            await gate.wrap(provider.model, 'answer').doGenerate(input);
            expect(observations).toEqual([
                { jobId, attemptId: accounting.admit.mock.calls[0]![0].callId },
            ]);

            expect(accounting.settle).toHaveBeenCalledOnce();

            return observations[0]!.attemptId;
        };

        expect(currentTextAiProviderAttemptWitness()).toBeUndefined();
        const attempts = await Promise.all([
            run('00000000-0000-4000-8000-000000000001'),
            run('00000000-0000-4000-8000-000000000002'),
        ]);

        expect(new Set(attempts).size).toBe(2);
        expect(currentTextAiProviderAttemptWitness()).toBeUndefined();
    });

    it('awaits durable admission before dispatch and usage settlement before returning', async () => {
        let admit!: () => void;
        let settle!: () => void;
        const accounting = tutorAccountingFixture();
        accounting.admit.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    admit = resolve;
                }),
        );

        accounting.settle.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    settle = resolve;
                }),
        );

        const provider = scriptedTutorModel(['Explanation']);
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        let done = false;
        const result = gate
            .wrap(provider.model, 'answer')
            .doGenerate(input)
            .then(() => {
                done = true;
            });

        await vi.waitFor(() => expect(accounting.admit).toHaveBeenCalledOnce());
        expect(provider.requests).toHaveLength(0);
        expect(gate.remainingBudget).toMatchObject({
            remainingCalls: 4,
            remainingOutputTokens: 5904,
        });

        admit();
        await vi.waitFor(() =>
            expect(accounting.settle).toHaveBeenCalledOnce(),
        );

        expect(done).toBe(false);
        expect(gate.remainingBudget.remainingOutputTokens).toBe(5904);
        settle();
        await result;
        expect(done).toBe(true);
        expect(gate.remainingBudget.remainingOutputTokens).toBe(9988);
    });

    it('bounds all provider calls and reserves room for an actor after memory processing', async () => {
        const provider = scriptedTutorModel([
            'observations',
            'reflection',
            'answer',
        ]);
        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await gate.wrap(provider.model, 'observation').doGenerate(input);
        await gate.wrap(provider.model, 'reflection').doGenerate(input);
        await gate.wrap(provider.model, 'answer').doGenerate(input);
        await expect(
            gate.wrap(provider.model, 'observation').doGenerate(input),
        ).rejects.toThrow('budget');

        expect(provider.requests).toHaveLength(3);
    });

    it('aborts after provider failure and never dispatches an SDK retry', async () => {
        const provider = scriptedTutorModel([]);
        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const model = gate.wrap(provider.model, 'observation');
        await expect(model.doGenerate(input)).rejects.toThrow('Unexpected');
        await expect(model.doGenerate(input)).rejects.toThrow('stopped');
        expect(provider.requests).toHaveLength(1);
        expect(accounting.fail).toHaveBeenCalledOnce();
    });

    it('accounts stream usage before exposing its terminal event', async () => {
        const provider = scriptedTutorModel(['Explanation']);
        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const result = await gate
            .wrap(provider.model, 'answer')
            .doStream(input);
        const reader = result.stream.getReader();
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }

            if (next.value.type === 'finish') {
                expect(accounting.settle).toHaveBeenCalledOnce();
            }
        }

        expect(accounting.fail).not.toHaveBeenCalled();
    });

    it('caps concurrent admissions at the shared output allowance before dispatch', async () => {
        const accounting = tutorAccountingFixture();
        let release!: () => void;
        const barrier = new Promise<void>((resolve) => {
            release = resolve;
        });

        accounting.admit.mockImplementation(() => barrier);
        const provider = scriptedTutorModel([
            'one',
            'two',
            'three',
            'four',
            'five',
        ]);
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const model = gate.wrap(provider.model, 'answer');
        const calls = Array.from({ length: 6 }, () => model.doGenerate(input));
        release();
        const results = await Promise.allSettled(calls);
        expect(accounting.admit).toHaveBeenCalledTimes(3);
        expect(
            accounting.admit.mock.calls.map(([call]) => call.maxOutputTokens),
        ).toEqual([4096, 4096, 1808]);

        expect(results.every((result) => result.status === 'rejected')).toBe(
            true,
        );

        expect(provider.requests).toHaveLength(0);
    });

    it('preserves non-overlapping provider cache meters for expense accounting', async () => {
        const provider = scriptedTutorModel(['cached']);
        const original = provider.model.doGenerate;
        provider.model.doGenerate = async (request) => {
            const result = await original(request);
            Object.defineProperty(result, 'usage', {
                value: {
                    inputTokens: { total: 50, cacheRead: 20, cacheWrite: 5 },
                    outputTokens: { total: 12 },
                },
            });

            return result;
        };

        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await gate.wrap(provider.model, 'answer').doGenerate(input);
        expect(accounting.settle).toHaveBeenCalledWith(expect.anything(), {
            inputTokens: 50,
            outputTokens: 12,
            cacheReadTokens: 20,
            cacheWriteTokens: 5,
        });
    });

    it('retains an actual provider output limit even without trustworthy usage', async () => {
        const provider = scriptedTutorModel(['partial valid response']);
        const original = provider.model.doGenerate;
        provider.model.doGenerate = async (request) => {
            const result = await original(request);
            Object.defineProperty(result, 'usage', { value: {} });
            Object.defineProperty(result, 'finishReason', { value: 'length' });

            return result;
        };

        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await gate.wrap(provider.model, 'answer').doGenerate(input);
        expect(accounting.fail.mock.calls[0]?.[0].outputLimitReached).toBe(
            true,
        );

        expect(gate.signal.aborted).toBe(false);
    });

    it('dispatches only the affordable output allowance returned by accounting', async () => {
        const provider = scriptedTutorModel(['tiny answer']);
        const accounting = tutorAccountingFixture();
        accounting.admit.mockResolvedValue({ maxOutputTokens: 12 });
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await gate.wrap(provider.model, 'answer').doGenerate(input);
        expect(provider.requests[0]?.maxOutputTokens).toBe(12);
        expect(accounting.settle.mock.calls[0]?.[0].maxOutputTokens).toBe(12);
    });

    it('preserves a successful result with unknown usage without fabricating a charge', async () => {
        const provider = scriptedTutorModel(['unused']);
        provider.model.doGenerate = async () => ({
            content: [],
            finishReason: 'stop',
            usage: {
                inputTokens: undefined,
                outputTokens: undefined,
                totalTokens: undefined,
            },
            warnings: [],
        });

        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });

        await expect(
            gate.wrap(provider.model, 'answer').doGenerate(input),
        ).resolves.toHaveProperty('content');

        expect(gate.signal.aborted).toBe(false);
        expect(accounting.settle).not.toHaveBeenCalled();
        expect(accounting.fail).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            'missing-usage',
        );

        expect(accounting.settle).not.toHaveBeenCalled();
    });

    it('does not retry admission failures or dispatch after cancellation during admission', async () => {
        const accounting = tutorAccountingFixture();
        const provider = scriptedTutorModel(['unused']);
        const controller = new AbortController();
        accounting.admit.mockImplementation(async () => {
            controller.abort();
        });

        const gate = createTutorModelGate({
            accounting,
            signal: controller.signal,
            maxInputTokens: 64000,
        });

        await expect(
            gate.wrap(provider.model, 'answer').doGenerate(input),
        ).rejects.toThrow();

        expect(provider.requests).toHaveLength(0);
        expect(accounting.fail).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            'aborted',
        );
    });

    it('tracks premature EOF on a dispatched stream as an uncertain provider result', async () => {
        const provider = scriptedTutorModel([]);
        provider.model.doStream = async () => ({
            stream: new ReadableStream({
                start(controller) {
                    controller.close();
                },
            }),
        });

        const accounting = tutorAccountingFixture();
        const gate = createTutorModelGate({
            accounting,
            signal: new AbortController().signal,
            maxInputTokens: 64000,
        });
        const result = await gate
            .wrap(provider.model, 'authoring')
            .doStream(input);

        await expect(result.stream.getReader().read()).rejects.toThrow();
        expect(gate.providerFailure?.purpose).toBe('authoring');
        expect(accounting.fail).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            'missing-usage',
        );
    });

    it('cancels an unresponsive provider stream and retains admitted liability without inventing usage', async () => {
        const accounting = tutorAccountingFixture();
        const provider = scriptedTutorModel(['unused']);
        provider.model.doStream = async () => ({
            stream: new ReadableStream(),
        });

        const controller = new AbortController();
        const gate = createTutorModelGate({
            accounting,
            signal: controller.signal,
            maxInputTokens: 64000,
        });
        const result = await gate
            .wrap(provider.model, 'answer')
            .doStream(input);
        const reading = result.stream.getReader().read();
        controller.abort(new Error('Learner stopped'));
        await expect(reading).rejects.toThrow('Learner stopped');
        expect(accounting.fail).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            'aborted',
        );

        expect(accounting.settle).not.toHaveBeenCalled();
    });

    it('propagates validated measured partial usage from an aborted provider stream', async () => {
        const accounting = tutorAccountingFixture();
        const provider = scriptedTutorModel(['unused']);
        const controller = new AbortController();
        provider.model.doStream = async () => ({
            stream: new ReadableStream({
                start(stream) {
                    stream.enqueue({
                        type: 'text-delta',
                        id: 'partial',
                        delta: 'Partial answer',
                    });
                },
            }),
        });

        const gate = createTutorModelGate({
            accounting,
            signal: controller.signal,
            maxInputTokens: 64000,
        });
        const result = await gate
            .wrap(provider.model, 'answer')
            .doStream(input);
        const reader = result.stream.getReader();
        await reader.read();
        const reading = reader.read();
        const error = Object.assign(new Error('Learner stopped'), {
            usage: { inputTokens: 100, outputTokens: 50 },
        });

        controller.abort(error);
        await expect(reading).rejects.toThrow('Learner stopped');
        expect(accounting.fail).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            'aborted',
            { inputTokens: 100, outputTokens: 50 },
        );

        expect(accounting.settle).not.toHaveBeenCalled();
    });
});
