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

it('sends one near-40k exact source passage to authoring for several grammar components', async () => {
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
                    taskId: 'other-rule',
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'grammar',
                            language: 'en',
                            rule: 'Another supplied rule.',
                        },
                    ],
                },
            ],
        };
    });
    const result = await createLearningContentAuthoring({ generate }).generate(
        {
            tasks: [
                brief().tasks[0]!,
                { ...brief().tasks[0]!, id: 'other-rule' },
            ],
        },
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

it('deduplicates an exact authorized selection while preserving its named exercise provenance', async () => {
    const selection = {
        noteId: randomUUID(),
        noteVersion: 1,
        text: 'Mira borrowed a book. '.repeat(300),
    };
    const generate = vi.fn(async ({ prompt }: { prompt: string }) => {
        expect(prompt.split(selection.text)).toHaveLength(2);

        return {
            tasks: [
                {
                    taskId: 'practice',
                    blocks: [
                        {
                            id: randomUUID(),
                            type: 'exercise',
                            format: 'free-text',
                            question: 'What did Mira borrow?',
                            referenceAnswer: 'A book.',
                            explanation:
                                'The selected text states that Mira borrowed a book.',
                            semantics: {
                                activity: { id: 'R04', version: 1 },
                                objective: 'Find the stated object.',
                                language: 'en',
                                explanationLanguage: 'en',
                                format: 'free-text',
                                checking: {
                                    policy: 'ai-rubric',
                                    rubric: {
                                        criteria: [
                                            {
                                                dimension: 'task-completion',
                                                requirement:
                                                    'Answer the question.',
                                            },
                                            {
                                                dimension: 'meaning',
                                                requirement:
                                                    'Identify a book as the borrowed object.',
                                            },
                                            {
                                                dimension: 'evidence',
                                                requirement:
                                                    'Use the statement: Mira borrowed a book.',
                                            },
                                        ],
                                    },
                                },
                            },
                            sourceBindings: [{ kind: 'text-selection' }],
                        },
                    ],
                },
            ],
        };
    });
    const result = await createLearningContentAuthoring({
        generate,
        taskSources: new Map([['practice', { blocks: [], selection }]]),
    }).generate(
        {
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    language: 'en',
                    explanationLanguage: 'en',
                    source: { kind: 'selection' },
                    instruction: 'Ask about what Mira borrowed.',
                    count: 1,
                    activities: [{ activityId: 'R04', count: 1 }],
                },
            ],
        },
        new AbortController().signal,
    );

    expect(result.status).toBe('ready');
    expect(generate).toHaveBeenCalledOnce();
    if (result.status === 'ready') {
        const block = result.proposal.blocks[0];
        expect(block?.type === 'exercise' && block.semantics?.sources).toEqual([
            {
                kind: 'text-selection',
                origin: { noteId: selection.noteId, noteVersion: 1 },
                text: selection.text,
            },
        ]);
    }
});

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
