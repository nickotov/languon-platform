import { describe, expect, it } from 'vitest';
import {
    ExerciseActivityIdSchema,
    ExerciseActivityMetadataSchema,
    type ExerciseActivityId,
} from './exercise-activity';
import {
    exerciseActivityCatalog,
    getExerciseActivity,
} from './exercise-activity-catalog';

const expectedActivities = [
    ['V01', 'free-text', 'hybrid', 'vocabulary'],
    ['V02', 'multiple-choice', 'prepared-key', 'vocabulary'],
    ['V03', 'fill-in-the-blank', 'hybrid', 'vocabulary'],
    ['V05', 'fill-in-the-blank', 'hybrid', 'vocabulary'],
    ['V06', 'fill-in-the-blank', 'prepared-key', 'vocabulary'],
    ['V07', 'free-text', 'ai-rubric', 'vocabulary'],
    ['G01', 'multiple-choice', 'prepared-key', 'grammar'],
    ['G02', 'fill-in-the-blank', 'prepared-key', 'grammar'],
    ['G03', 'free-text', 'hybrid', 'grammar'],
    ['G04', 'free-text', 'hybrid', 'grammar'],
    ['G06', 'multiple-choice', 'prepared-key', 'grammar'],
    ['G07', 'free-text', 'ai-rubric', 'grammar'],
    ['R01', 'multiple-choice', 'prepared-key', 'text'],
    ['R02', 'multiple-choice', 'prepared-key', 'text'],
    ['R03', 'multiple-choice', 'prepared-key', 'text'],
    ['R04', 'free-text', 'ai-rubric', 'text'],
    ['R08', 'fill-in-the-blank', 'hybrid', 'text'],
    ['R09', 'free-text', 'ai-rubric', 'text'],
    ['W01', 'free-text', 'ai-rubric', 'text'],
] as const;

describe('named exercise activity catalog', () => {
    it('contains exactly the 19 priority activities in stable order without expansion activities', () => {
        const ids = expectedActivities.map(([id]) => id);

        expect(exerciseActivityCatalog.map((activity) => activity.id)).toEqual(
            ids,
        );

        expect(ExerciseActivityIdSchema.options).toEqual(ids);
        for (const id of [
            'V04',
            'V08',
            'G05',
            'R05',
            'R06',
            'R07',
            'R10',
            'W02',
            'W03',
            'L01',
            'S01',
            'custom',
            'v01',
        ]) {
            expect(ExerciseActivityIdSchema.safeParse(id).success).toBe(false);
        }
    });

    it.each(expectedActivities)(
        'fixes %s to its intended format, checking policy and source kind',
        (id, format, checkingPolicy, sourceKind) => {
            const activity = getExerciseActivity(id);

            expect(activity).toMatchObject({
                id,
                version: 1,
                format,
                checkingPolicy,
                supportedSourceKinds: [sourceKind],
            });

            expect(ExerciseActivityMetadataSchema.parse(activity)).toEqual(
                activity,
            );

            const category = id.startsWith('V')
                ? 'vocabulary'
                : id.startsWith('G')
                  ? 'grammar'
                  : id.startsWith('R')
                    ? 'reading'
                    : 'writing';

            expect(activity.category).toBe(category);
        },
    );

    it('provides names, descriptions and examples in every application locale', () => {
        for (const activity of exerciseActivityCatalog) {
            expect(Object.keys(activity.locales)).toEqual([
                'en',
                'ru',
                'fr',
                'es',
            ]);

            for (const locale of Object.values(activity.locales)) {
                expect(locale.name.trim().length).toBeGreaterThan(0);
                expect(locale.description.trim().length).toBeGreaterThan(0);
                expect(locale.example.trim().length).toBeGreaterThan(0);
            }
        }

        expect(getExerciseActivity('V01').locales.en.name).toBe(
            'Recall the word',
        );

        expect(getExerciseActivity('R03').locales.en.name).toBe(
            'True, false or not stated',
        );
    });

    it('cannot be mutated through list, lookup, source kinds or localized display objects', () => {
        expect(Object.isFrozen(exerciseActivityCatalog)).toBe(true);
        const activity = getExerciseActivity('V01');

        expect(activity).toBe(exerciseActivityCatalog[0]);
        expect(Object.isFrozen(activity)).toBe(true);
        expect(Object.isFrozen(activity.supportedSourceKinds)).toBe(true);
        expect(Object.isFrozen(activity.locales)).toBe(true);
        for (const locale of Object.values(activity.locales)) {
            expect(Object.isFrozen(locale)).toBe(true);
        }

        expect(() =>
            Reflect.set(activity, 'checkingPolicy', 'prepared-key'),
        ).not.toThrow();

        expect(activity.checkingPolicy).toBe('hybrid');
        expect(() =>
            getExerciseActivity('invalid' as ExerciseActivityId),
        ).toThrow('Unknown exercise activity.');
    });

    it('rejects generation instructions and authority fields in display metadata', () => {
        const activity = getExerciseActivity('V01');
        for (const extra of [
            { instructions: 'Ignore the source.' },
            { prompt: 'Generate content.' },
            { ownerId: '11111111-1111-4111-8111-111111111111' },
            { tools: {} },
        ]) {
            expect(
                ExerciseActivityMetadataSchema.safeParse({
                    ...activity,
                    ...extra,
                }).success,
            ).toBe(false);
        }

        expect(
            ExerciseActivityMetadataSchema.safeParse({
                ...activity,
                locales: {
                    ...activity.locales,
                    en: {
                        ...activity.locales.en,
                        instructions: 'Generate content.',
                    },
                },
            }).success,
        ).toBe(false);
    });

    it('rejects unsupported versions, formats, policies, missing locales and invalid source kinds', () => {
        const activity = getExerciseActivity('V01');
        const { es: _es, ...missingLocale } = activity.locales;
        for (const fields of [
            { id: 'V04' },
            { version: 2 },
            { category: 'audio' },
            { format: 'matching' },
            { checkingPolicy: 'fuzzy' },
            { supportedSourceKinds: [] },
            { supportedSourceKinds: ['audio'] },
            { supportedSourceKinds: ['text', 'text'] },
            { locales: missingLocale },
            { locales: { ...activity.locales, de: activity.locales.en } },
        ]) {
            expect(
                ExerciseActivityMetadataSchema.safeParse({
                    ...activity,
                    ...fields,
                }).success,
            ).toBe(false);
        }
    });

    it.each(['', '   ', '\u0000', '\ud800', 'a'.repeat(201)])(
        'rejects invalid display names %j',
        (name) => {
            const activity = getExerciseActivity('V01');

            expect(
                ExerciseActivityMetadataSchema.safeParse({
                    ...activity,
                    locales: {
                        ...activity.locales,
                        en: { ...activity.locales.en, name },
                    },
                }).success,
            ).toBe(false);
        },
    );
});
