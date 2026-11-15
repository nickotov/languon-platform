import {
    exerciseActivityExamples,
    exerciseExampleSources,
    type ExerciseActivityExample,
} from '@/fsd/entities/learning-blocks/examples';
import { activityPrompt, guideLocale } from './content';

export type GuideActivity = ExerciseActivityExample & { prompt: string };
export const guideSources = exerciseExampleSources;

export function guideActivities(locale: string): GuideActivity[] {
    const language = guideLocale(locale);

    return exerciseActivityExamples(locale).map((example) => ({
        ...example,
        prompt: activityPrompt(
            language,
            example.activity.id,
            example.activity.locales[language].name,
        ),
    }));
}

/** Full-document validation also proves the frozen sources resolve locally. */
export function guideKnowledgeBody(locale: string) {
    return {
        schemaVersion: 2 as const,
        document: {
            type: 'doc',
            content: [
                ...guideSources,
                ...guideActivities(locale).map((example) => example.block),
            ].map((block) => ({ type: 'learningBlock', attrs: { block } })),
        },
    };
}
