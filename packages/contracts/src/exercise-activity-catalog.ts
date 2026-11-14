import {
    ExerciseActivityMetadataSchema,
    type ExerciseActivityId,
    type ExerciseActivityMetadata,
} from './exercise-activity';
import { exerciseActivityLocales } from './exercise-activity-locales';

const definitions = [
    {
        id: 'V01',
        version: 1,
        category: 'vocabulary',
        format: 'free-text',
        checkingPolicy: 'hybrid',
        supportedSourceKinds: ['vocabulary'],
    },
    {
        id: 'V02',
        version: 1,
        category: 'vocabulary',
        format: 'multiple-choice',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['vocabulary'],
    },
    {
        id: 'V03',
        version: 1,
        category: 'vocabulary',
        format: 'fill-in-the-blank',
        checkingPolicy: 'hybrid',
        supportedSourceKinds: ['vocabulary'],
    },
    {
        id: 'V05',
        version: 1,
        category: 'vocabulary',
        format: 'fill-in-the-blank',
        checkingPolicy: 'hybrid',
        supportedSourceKinds: ['vocabulary'],
    },
    {
        id: 'V06',
        version: 1,
        category: 'vocabulary',
        format: 'fill-in-the-blank',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['vocabulary'],
    },
    {
        id: 'V07',
        version: 1,
        category: 'vocabulary',
        format: 'free-text',
        checkingPolicy: 'ai-rubric',
        supportedSourceKinds: ['vocabulary'],
    },
    {
        id: 'G01',
        version: 1,
        category: 'grammar',
        format: 'multiple-choice',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['grammar'],
    },
    {
        id: 'G02',
        version: 1,
        category: 'grammar',
        format: 'fill-in-the-blank',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['grammar'],
    },
    {
        id: 'G03',
        version: 1,
        category: 'grammar',
        format: 'free-text',
        checkingPolicy: 'hybrid',
        supportedSourceKinds: ['grammar'],
    },
    {
        id: 'G04',
        version: 1,
        category: 'grammar',
        format: 'free-text',
        checkingPolicy: 'hybrid',
        supportedSourceKinds: ['grammar'],
    },
    {
        id: 'G06',
        version: 1,
        category: 'grammar',
        format: 'multiple-choice',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['grammar'],
    },
    {
        id: 'G07',
        version: 1,
        category: 'grammar',
        format: 'free-text',
        checkingPolicy: 'ai-rubric',
        supportedSourceKinds: ['grammar'],
    },
    {
        id: 'R01',
        version: 1,
        category: 'reading',
        format: 'multiple-choice',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['text'],
    },
    {
        id: 'R02',
        version: 1,
        category: 'reading',
        format: 'multiple-choice',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['text'],
    },
    {
        id: 'R03',
        version: 1,
        category: 'reading',
        format: 'multiple-choice',
        checkingPolicy: 'prepared-key',
        supportedSourceKinds: ['text'],
    },
    {
        id: 'R04',
        version: 1,
        category: 'reading',
        format: 'free-text',
        checkingPolicy: 'ai-rubric',
        supportedSourceKinds: ['text'],
    },
    {
        id: 'R08',
        version: 1,
        category: 'reading',
        format: 'fill-in-the-blank',
        checkingPolicy: 'hybrid',
        supportedSourceKinds: ['text'],
    },
    {
        id: 'R09',
        version: 1,
        category: 'reading',
        format: 'free-text',
        checkingPolicy: 'ai-rubric',
        supportedSourceKinds: ['text'],
    },
    {
        id: 'W01',
        version: 1,
        category: 'writing',
        format: 'free-text',
        checkingPolicy: 'ai-rubric',
        supportedSourceKinds: ['text'],
    },
] as const satisfies readonly Omit<ExerciseActivityMetadata, 'locales'>[];

/** Catalog order is stable; an exercise is one answerable item, not this definition. */
export const exerciseActivityCatalog: readonly ExerciseActivityMetadata[] =
    Object.freeze(
        definitions.map((definition) =>
            ExerciseActivityMetadataSchema.parse({
                ...definition,
                locales: exerciseActivityLocales[definition.id],
            }),
        ),
    );

const byId = new Map(
    exerciseActivityCatalog.map((activity) => [activity.id, activity]),
);

export function getExerciseActivity(
    id: ExerciseActivityId,
): ExerciseActivityMetadata {
    const activity = byId.get(id);
    if (!activity) {
        throw new Error('Unknown exercise activity.');
    }

    return activity;
}
