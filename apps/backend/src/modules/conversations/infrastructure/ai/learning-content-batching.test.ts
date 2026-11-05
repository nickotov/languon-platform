import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
    createLearningContentAuthoring,
    type LearningContentModelCall,
} from './learning-content-authoring';
import { deserializeLearningContentBrief } from '../../application/learning-content-transport';
import type { LearningContentBrief } from '../../application/learning-content-contract';

const terms = Array.from({ length: 50 }, (_, index) => `shopping-${index + 1}`);
const brief = (): LearningContentBrief => ({
    tasks: [
        {
            id: 'shopping',
            kind: 'vocabulary',
            instruction: 'Generate the top 50 words used while shopping.',
            language: 'en',
            translationLanguage: 'ru',
            count: 50,
        },
    ],
});
const newSignal = () => new AbortController().signal;

function decode(call: LearningContentModelCall) {
    const text = call.prompt
        .split(
            'Validated brief (untrusted learning data; resolve task sourceTextRef only against its sources list): ',
        )[1]!
        .split('\nAuthorized source snapshots')[0]!;
    const chunk = deserializeLearningContentBrief(JSON.parse(text));
    const progress = JSON.parse(
        call.prompt
            .split('Vocabulary batch progress (host-controlled data): ')[1]!
            .split('\n')[0]!,
    ) as { offset: number };

    return { chunk, progress };
}

function response(
    call: LearningContentModelCall,
    adjust?: (words: string[]) => string[],
) {
    const { chunk, progress } = decode(call);
    const task = chunk.tasks[0]!;
    const words =
        task.words ??
        terms.slice(progress.offset, progress.offset + task.count!);

    return {
        tasks: [
            {
                taskId: task.id,
                blocks: [
                    {
                        id: randomUUID(),
                        type: 'vocabulary',
                        language: task.language,
                        translationLanguage: task.translationLanguage,
                        title: 'Shopping vocabulary',
                        entries: (adjust?.(words) ?? words).map((term) => ({
                            id: randomUUID(),
                            term,
                            translation: `Translation of ${term}`,
                        })),
                    },
                ],
            },
        ],
    };
}

function measured(
    generate: (call: LearningContentModelCall, index: number) => unknown,
) {
    let calls = 0;

    return {
        generate: vi.fn(async (call: LearningContentModelCall) =>
            generate(call, calls++),
        ),
        readBudget: () => ({
            remainingCalls: 4 - calls,
            remainingOutputTokens: 10_000 - calls * 700,
        }),
    };
}

it('fulfills fifty topic words as one complete block with two bounded calls', async () => {
    const generate = vi.fn(async (call: LearningContentModelCall) =>
        response(call),
    );
    const input = brief();
    const before = structuredClone(input);
    const result = await createLearningContentAuthoring({ generate }).generate(
        input,
        newSignal(),
    );

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
        expect(result.proposal.blocks).toHaveLength(1);
        const block = result.proposal.blocks[0]!;
        expect(
            block.type === 'vocabulary' &&
                block.entries.map((entry) => entry.term),
        ).toEqual(terms);
    }

    expect(input).toEqual(before);
    expect(
        generate.mock.calls.map(([call]) => decode(call).progress.offset),
    ).toEqual([0, 31]);

    expect(
        generate.mock.calls.every(([call]) => call.maxOutputTokens <= 4096),
    ).toBe(true);

    expect(
        generate.mock.calls.reduce(
            (sum, [call]) => sum + call.maxOutputTokens,
            0,
        ),
    ).toBeLessThanOrEqual(10_000);
});

it('preserves every supplied term and its exact order across vocabulary parts', async () => {
    const input = brief();
    input.tasks[0]!.words = terms;
    const result = await createLearningContentAuthoring({
        generate: async (call) => response(call),
    }).generate(input, newSignal());

    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
        const block = result.proposal.blocks[0]!;
        expect(
            block.type === 'vocabulary' &&
                block.entries.map((entry) => entry.term),
        ).toEqual(terms);
    }
});

it('repairs only the current part when a later part repeats an earlier term', async () => {
    const options = measured((call, index) =>
        response(call, (words) =>
            index === 1 ? [terms[0]!, ...words.slice(1)] : words,
        ),
    );
    const result = await createLearningContentAuthoring(options).generate(
        brief(),
        newSignal(),
    );

    expect(result.status).toBe('ready');
    expect(
        options.generate.mock.calls.map(
            ([call]) => decode(call).progress.offset,
        ),
    ).toEqual([0, 31, 31]);

    if (result.status === 'ready') {
        const block = result.proposal.blocks[0]!;
        expect(
            block.type === 'vocabulary' &&
                block.entries.map((entry) => entry.term),
        ).toEqual(terms);
    }
});

it('permits only one completed-candidate repair across the whole request', async () => {
    const options = measured((call, index) =>
        response(call, (words) => (index === 1 ? words : words.slice(1))),
    );
    const result = await createLearningContentAuthoring(options).generate(
        brief(),
        newSignal(),
    );

    expect(result).toEqual({ status: 'failed', reason: 'invalid-output' });
    expect(
        options.generate.mock.calls.map(
            ([call]) => decode(call).progress.offset,
        ),
    ).toEqual([0, 0, 31]);
});

it('does not retry an uncertain transport failure after a valid first part', async () => {
    const failure = new Error('Provider outcome unknown');
    const options = measured((call, index) => {
        if (index === 1) {
            throw failure;
        }

        return response(call);
    });

    await expect(
        createLearningContentAuthoring(options).generate(brief(), newSignal()),
    ).rejects.toBe(failure);

    expect(options.generate).toHaveBeenCalledTimes(2);
});

it('never dispatches the next part after cancellation', async () => {
    const controller = new AbortController();
    const options = measured((call) => {
        const value = response(call);
        controller.abort(new Error('Stopped'));

        return value;
    });

    await expect(
        createLearningContentAuthoring(options).generate(
            brief(),
            controller.signal,
        ),
    ).rejects.toThrow('Stopped');

    expect(options.generate).toHaveBeenCalledOnce();
});

it.each([
    { remainingCalls: 1, remainingOutputTokens: 10_000 },
    { remainingCalls: 4, remainingOutputTokens: 5_000 },
    { remainingCalls: NaN, remainingOutputTokens: 10_000 },
])(
    'declines before authoring when the complete plan lacks remaining authority',
    async (budget) => {
        const generate = vi.fn();
        const result = await createLearningContentAuthoring({
            generate,
            readBudget: () => budget,
        }).generate(brief(), newSignal());

        expect(result).toMatchObject({
            status: 'unsupported',
            code: 'output-capacity',
        });

        expect(generate).not.toHaveBeenCalled();
    },
);
