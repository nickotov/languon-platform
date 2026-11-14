import { expect, it } from 'vitest';
import { guideCopy } from '../src/fsd/pages/workbook-guide/lib/content';
import { guideActivities } from '../src/fsd/pages/workbook-guide/lib/examples';

it('provides three distinct, usable recipes and the Knowledge workflow in every locale', () => {
    for (const locale of ['en', 'ru', 'fr', 'es']) {
        const copy = guideCopy(locale);
        expect(copy.steps).toHaveLength(4);
        expect(copy.recipes.map(({ id }) => id)).toEqual([
            'specific',
            'best-fit',
            'mixed',
        ]);

        expect(new Set(copy.recipes.map(({ prompt }) => prompt)).size).toBe(3);
        expect(copy.recipes[0]!.prompt).toContain('V02');
        for (const demo of guideActivities(locale)) {
            expect(demo.prompt).toContain(demo.activity.id);
            expect(demo.prompt).not.toMatch(/\{(?:id|name)\}/);
            expect(demo.explanation.length).toBeGreaterThan(15);
        }
    }
});

it('localizes explanations, prompts and feedback while retaining the English source corpus', () => {
    const en = guideActivities('en');
    const ru = guideActivities('ru');
    expect(ru[0]!.sourceText).toBe(en[0]!.sourceText);
    expect(ru[0]!.explanation).not.toBe(en[0]!.explanation);
    expect(ru[0]!.sampleResponses[0]!.evaluation).not.toEqual(
        en[0]!.sampleResponses[0]!.evaluation,
    );

    expect(guideCopy('unknown')).toEqual(guideCopy('en'));
});

it('teaches when to choose each activity without repeating answer feedback', () => {
    for (const locale of ['en', 'ru', 'fr', 'es']) {
        const examples = guideActivities(locale);
        expect(
            new Set(examples.map(({ useCaseGuidance }) => useCaseGuidance))
                .size,
        ).toBe(19);

        for (const example of examples) {
            expect(example.useCaseGuidance.length).toBeGreaterThan(80);
            expect(example.useCaseGuidance).not.toBe(example.explanation);
            expect(example.useCaseGuidance).not.toBe(example.block.explanation);
        }
    }
});

it('preserves the translation direction and explanation language in the copied W01 recipe', () => {
    const directions = {
        en: [
            'Source language: English',
            'Target language: French',
            'Explanation language: English',
        ],
        ru: [
            'Язык источника: английский',
            'Язык перевода: французский',
            'Язык объяснений: русский',
        ],
        fr: [
            'Langue source : anglais',
            'Langue cible : français',
            'Langue des explications : français',
        ],
        es: [
            'Idioma de origen: inglés',
            'Idioma de destino: francés',
            'Idioma de las explicaciones: español',
        ],
    };

    for (const [locale, phrases] of Object.entries(directions)) {
        const translation = guideActivities(locale).find(
            ({ activity }) => activity.id === 'W01',
        )!;

        for (const phrase of phrases) {
            expect(translation.prompt).toContain(phrase);
        }
    }
});

it('demonstrates all four assessed AI outcomes with localized incorrect feedback', () => {
    for (const locale of ['en', 'ru', 'fr', 'es']) {
        const examples = guideActivities(locale);
        const statuses = new Set(
            examples.flatMap(({ sampleResponses }) =>
                sampleResponses.map(({ evaluation }) => evaluation.status),
            ),
        );

        expect([...statuses].sort()).toEqual([
            'correct',
            'incorrect',
            'partially-correct',
            'unable-to-assess',
        ]);

        const incorrect = examples
            .find(({ activity }) => activity.id === 'R04')!
            .sampleResponses.find(
                ({ evaluation }) => evaluation.status === 'incorrect',
            )!;

        expect(incorrect.answer).toBe(
            'She drives to a bookshop to buy three books.',
        );

        if (incorrect.evaluation.status === 'incorrect') {
            expect(incorrect.evaluation.feedback!.length).toBeGreaterThan(30);
            expect(incorrect.evaluation.corrections).toHaveLength(1);
        }
    }
});
