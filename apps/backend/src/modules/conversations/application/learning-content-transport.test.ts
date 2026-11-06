import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { LearningContentBriefSchema } from './learning-content-contract';
import {
    deserializeLearningContentBrief,
    serializeLearningContentBrief,
} from './learning-content-transport';
import { createLearningContentAuthoring } from '../infrastructure/ai/learning-content-authoring';
import { createLearningContentTools } from '../infrastructure/ai/learning-content-tools';

const source = 'Read '.repeat(7_900);
const brief = () => ({
    tasks: [
        {
            id: 'rule',
            kind: 'grammar' as const,
            instruction: 'Explain the supplied passage.',
            language: 'en',
            sourceText: source,
        },
        {
            id: 'practice',
            kind: 'exercises' as const,
            instruction: 'Practise the supplied passage.',
            language: 'en',
            count: 1,
            formats: ['free-text'],
            sourceText: source,
        },
    ],
});

it('deduplicates a near-40k exact passage across mixed tasks without raising the transport limit', () => {
    const original = brief();
    expect(JSON.stringify(original).length).toBeGreaterThan(60_000);
    const parsed = LearningContentBriefSchema.parse(original);
    const serialized = serializeLearningContentBrief(parsed);

    expect(serialized.length).toBeLessThan(40_000);
    expect(serialized.split(source)).toHaveLength(2);
    expect(deserializeLearningContentBrief(JSON.parse(serialized))).toEqual(
        original,
    );

    expect(deserializeLearningContentBrief(original)).toEqual(original);
});

it('retains aggregate rejection when genuinely distinct passages exceed the existing limit', () => {
    const original = brief();
    original.tasks[1]!.sourceText = 'Other '.repeat(6_500);

    expect(LearningContentBriefSchema.safeParse(original).success).toBe(false);
});

it('sends one exact source passage to authoring for several requested components', async () => {
    const generate = vi.fn(async ({ prompt }: { prompt: string }) => {
        expect(prompt.split(source)).toHaveLength(2);

        return {
            tasks: [
                {
                    taskId: 'rule',
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            language: 'en',
                            rule: 'A supplied rule.',
                        },
                    ],
                },
                {
                    taskId: 'practice',
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'exercise',
                            format: 'free-text',
                            question: 'What did you read?',
                            referenceAnswer: 'A passage.',
                            explanation: 'The passage supplies context.',
                        },
                    ],
                },
            ],
        };
    });
    const result = await createLearningContentAuthoring({ generate }).generate(
        brief(),
        new AbortController().signal,
    );

    expect(result.status).toBe('ready');
    expect(generate).toHaveBeenCalledOnce();
});

it.each(['missing', 'duplicate', 'unknown', 'unused'] as const)(
    'rejects %s compact source references',
    (mode) => {
        const compact = JSON.parse(serializeLearningContentBrief(brief()));
        if (mode === 'missing') {
            compact.sources = [];
        } else if (mode === 'duplicate') {
            compact.sources.push(compact.sources[0]);
        } else if (mode === 'unknown') {
            compact.tasks[0].sourceTextRef = 'source-9';
        } else {
            compact.sources.push({ id: 'source-2', text: 'Unused' });
        }

        expect(() => deserializeLearningContentBrief(compact)).toThrow();
    },
);

it('requires host-resolved source content in standalone tools before any model dispatch', async () => {
    const generate = vi.fn();
    const tools = createLearningContentTools({
        publish: async () => ({ id: '01900000-0000-4000-8000-000000000002' }),
        generate,
        signal: new AbortController().signal,
    });
    const result = await tools.generate_exercises.execute!(
        {
            instruction: 'Use my selected passage.',
            language: 'en',
            source: { kind: 'selection' },
        },
        {} as never,
    );

    expect(result).toMatchObject({
        status: 'needs-clarification',
        missing: [{ taskId: 'requested-content', fields: ['sourceText'] }],
    });

    expect(generate).not.toHaveBeenCalled();
});
