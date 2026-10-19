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
        admit();
        await vi.waitFor(() =>
            expect(accounting.settle).toHaveBeenCalledOnce(),
        );
        expect(done).toBe(false);
        settle();
        await result;
        expect(done).toBe(true);
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
            if (next.done) break;
            if (next.value.type === 'finish')
                expect(accounting.settle).toHaveBeenCalledOnce();
        }
        expect(accounting.fail).not.toHaveBeenCalled();
    });

    it('caps concurrent admissions at five calls before any provider dispatch', async () => {
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
        expect(accounting.admit).toHaveBeenCalledTimes(5);
        expect(results.every((result) => result.status === 'rejected')).toBe(
            true,
        );
        expect(provider.requests).toHaveLength(0);
    });

    it('retains unknown usage exactly once when the provider closes without totals', async () => {
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
        ).rejects.toThrow('usage');
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
});
