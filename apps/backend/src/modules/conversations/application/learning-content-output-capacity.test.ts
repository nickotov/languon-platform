import { expect, it, vi } from 'vitest';
import {
    learningContentRequirements,
    type LearningContentBrief,
} from './learning-content-contract';
import {
    estimateLearningContentOutput,
    learningContentOutputEstimateLimit,
} from './learning-content-output-capacity';
import { createLearningContentAuthoring } from '../infrastructure/ai/learning-content-authoring';
import { learningContentPresentation } from './learning-content-presentation';
import { ChatPreferencesSchema } from '@languon/contracts';

const bilingual = (sourceText: string): LearningContentBrief => ({
    tasks: [
        {
            id: 'text',
            kind: 'bilingual-text',
            instruction: 'Translate the whole supplied passage.',
            language: 'en',
            translationLanguage: 'ru',
            sourceText,
        },
    ],
});

it('allows the default vocabulary, grammar and five-exercise combination', () => {
    const brief: LearningContentBrief = {
        tasks: [
            {
                id: 'vocabulary',
                kind: 'vocabulary',
                instruction: 'Travel words.',
                language: 'en',
                translationLanguage: 'ru',
            },
            {
                id: 'grammar',
                kind: 'grammar',
                instruction: 'Travel grammar.',
                language: 'en',
            },
            {
                id: 'exercises',
                kind: 'exercises',
                instruction: 'Travel practice.',
                language: 'en',
            },
        ],
    };

    expect(estimateLearningContentOutput(brief)).toBe(3_320);
    expect(learningContentRequirements(brief)).toBeNull();
    brief.tasks.push({
        id: 'extra',
        kind: 'grammar',
        instruction: 'More grammar.',
        language: 'en',
    });

    expect(learningContentRequirements(brief)).toMatchObject({
        status: 'unsupported',
        code: 'output-capacity',
    });

    expect(brief.tasks).toHaveLength(4);
});

it('uses one aggregate estimate with an explicit source-echo boundary', () => {
    const atLimit = bilingual('a'.repeat(1_715));
    const aboveLimit = bilingual('a'.repeat(1_716));

    expect(estimateLearningContentOutput(atLimit)).toBe(
        learningContentOutputEstimateLimit,
    );

    expect(learningContentRequirements(atLimit)).toBeNull();
    expect(learningContentRequirements(aboveLimit)).toMatchObject({
        status: 'unsupported',
        code: 'output-capacity',
    });
});

it.each([
    Array.from({ length: 2_200 }, (_, index) =>
        String.fromCharCode(33 + ((index * 37) % 90)),
    ).join(''),
    'a\n'.repeat(1_000),
    '你好'.repeat(400),
    'Текст'.repeat(400),
    'A passage '.repeat(3_950),
])(
    'rejects large mandatory source plus translation output before dispatch',
    async (sourceText) => {
        const generate = vi.fn();
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(bilingual(sourceText), new AbortController().signal);

        expect(result).toMatchObject({
            status: 'unsupported',
            code: 'output-capacity',
        });

        expect(generate).not.toHaveBeenCalled();
    },
);

it('rejects a large exact word list without truncating or dispatching', async () => {
    const words = Array.from({ length: 200 }, (_, index) =>
        `${index}`.padEnd(100, 'x'),
    );
    const brief: LearningContentBrief = {
        tasks: [
            {
                id: 'words',
                kind: 'vocabulary',
                instruction: 'Use every supplied word.',
                language: 'en',
                translationLanguage: 'ru',
                words,
            },
        ],
    };

    const generate = vi.fn();
    const result = await createLearningContentAuthoring({ generate }).generate(
        brief,
        new AbortController().signal,
    );

    expect(result).toMatchObject({
        status: 'unsupported',
        code: 'output-capacity',
    });

    expect(brief.tasks[0]!.words).toHaveLength(200);
    expect(generate).not.toHaveBeenCalled();
});

it('reserves required word coverage even for one exercise without echoing the whole input passage', async () => {
    const brief: LearningContentBrief = {
        tasks: [
            {
                id: 'practice',
                kind: 'exercises',
                instruction: 'Use all these words.',
                language: 'en',
                count: 1,
                words: Array.from({ length: 200 }, (_, index) =>
                    `${index}`.padEnd(100, 'x'),
                ),
            },
        ],
    };
    const generate = vi.fn();
    const result = await createLearningContentAuthoring({ generate }).generate(
        brief,
        new AbortController().signal,
    );

    expect(result).toMatchObject({
        status: 'unsupported',
        code: 'output-capacity',
    });

    expect(generate).not.toHaveBeenCalled();
});

it('does not reserve echo output for long grammar and exercise input sources', () => {
    const sourceText = 'Read '.repeat(7_900);
    const brief: LearningContentBrief = {
        tasks: [
            {
                id: 'rule',
                kind: 'grammar',
                instruction: 'Explain.',
                language: 'en',
                sourceText,
            },
            {
                id: 'practice',
                kind: 'exercises',
                instruction: 'Practise.',
                language: 'en',
                sourceText,
            },
        ],
    };

    expect(estimateLearningContentOutput(brief)).toBe(2_100);
    expect(learningContentRequirements(brief)).toBeNull();
});

it('gives localized actionable output-capacity guidance', () => {
    const brief = bilingual('a'.repeat(2_000));
    const text = learningContentPresentation({
        status: 'unsupported',
        limitationCode: 'output-capacity',
        brief,
        preferences: ChatPreferencesSchema.parse({ replyLanguage: 'ru' }),
        message: 'Make content.',
    });

    expect(text).toContain('не поместится в одну генерацию');
    expect(text).toContain('разделите запрос');
    expect(text).not.toContain('4096');
});
