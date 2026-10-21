import { describe, expect, it } from 'vitest';
import {
    PortraitDocumentSchema,
    PortraitItemsSchema,
} from '@languon/contracts';
import {
    hasMeaningfulPortraitItems,
    containsPortraitDiagnosticDisclosure,
    portraitExpiry,
    validateReusablePortraitItems,
} from './portrait-policy';
import { summarizePortrait } from './portrait-summary';

describe('portrait policy', () => {
    it('distinguishes useful partial portraits from empty or withheld answers', () => {
        expect(hasMeaningfulPortraitItems(PortraitItemsSchema.parse({}))).toBe(
            false,
        );
        expect(
            hasMeaningfulPortraitItems(
                PortraitItemsSchema.parse({ ageRange: 'prefer-not-to-say' }),
            ),
        ).toBe(false);
        expect(
            hasMeaningfulPortraitItems(
                PortraitItemsSchema.parse({ mixedLanguage: false }),
            ),
        ).toBe(true);
    });
    it('retains practical accommodations without accepting common volunteered labels', () => {
        expect(() =>
            validateReusablePortraitItems({
                accommodations: ['I have ADHD; use short steps'],
            }),
        ).toThrow();
        expect(
            validateReusablePortraitItems({ accommodations: ['Short steps'] })
                .accommodations,
        ).toEqual(['Short steps']);
    });
    it('derives localized summaries only from present fields', () => {
        const items = PortraitItemsSchema.parse({
            explanationLanguages: ['en'],
            accommodations: ['Short steps'],
        });
        expect(summarizePortrait(items, 'en')).toContain(
            'You prefer explanations in: English.',
        );
        expect(summarizePortrait(items, 'en')).toContain(
            'What helps you learn: Short steps.',
        );
        expect(summarizePortrait(items, 'fr')).toContain('anglais');
        expect(summarizePortrait(items, 'ru')).toContain('английский');
        expect(summarizePortrait(items, 'es')).toContain('inglés');
        expect(summarizePortrait(items, 'en')).not.toContain('tone');
    });
    it('uses exactly fourteen days from learner activity', () => {
        expect(portraitExpiry(new Date('2026-10-20T12:00:00Z'))).toBe(
            '2026-11-03T12:00:00.000Z',
        );
    });
    it('keeps maximal valid items intact while selecting bounded complete summary assertions', () => {
        const custom = 'e\u0301👩‍👩‍👧‍👦'.repeat(5) + 'a'.repeat(190);
        const items = PortraitItemsSchema.parse({
            languages: Array.from({ length: 30 }, (_, i) => ({
                language: `en-x-${i}`,
                learning: true,
                clarification: custom,
            })),
            goals: Array.from({ length: 12 }, () => custom),
            accommodations: Array.from({ length: 12 }, () => custom),
            hobbies: Array.from({ length: 12 }, () => custom),
        });
        const original = structuredClone(items);
        for (const locale of ['en', 'ru', 'fr', 'es'] as const) {
            const summary = summarizePortrait(items, locale);
            expect(summary.length).toBeLessThanOrEqual(10000);
            expect(summary).toContain(custom);
            expect(
                PortraitDocumentSchema.safeParse({
                    items,
                    locale,
                    summary,
                    updatedAt: '2026-10-20T12:00:00.000Z',
                }).success,
            ).toBe(true);
            expect(items).toEqual(original);
        }
    });
    it('keeps rich word-based summaries concise without cutting an individual answer', () => {
        const statement =
            'Practice travel vocabulary with concrete examples and short review steps';
        const items = PortraitItemsSchema.parse({
            goals: Array.from({ length: 12 }, () => statement),
            accommodations: Array.from({ length: 12 }, () => statement),
        });
        const summary = summarizePortrait(items, 'en');
        expect(summary.split(/\s+/u).length).toBeLessThanOrEqual(180);
        expect(summary).toContain(statement + '.');
        expect(summary).toContain('More confirmed details');
    });
    describe('diagnostic disclosure boundary', () => {
        const labels = [
            'I have depression; use short steps',
            'I have anxiety; use short steps',
            'У меня депрессия; нужны короткие шаги',
            'У меня тревожное расстройство',
            'J’ai une dépression; des étapes courtes',
            'Je souffre d’anxiété',
            'Tengo depresión; necesito pasos cortos',
            'Tengo un trastorno de ansiedad',
            'I have d.e.p.r.e.s.s.i.o.n',
            'I have a\u200bnxiety',
            'I have dépréssíon',
            'I have ＡＤＨＤ',
            'I have A.D.H.D.',
            'У меня д.е.п.р.е.с.с.и.я',
            'У меня т\u200bревожность',
            'Je souffre d’a.n.x.i.é.t.é',
            'Tengo a.n.s.i.e.d.a.d',
            'I was diagnosed with an unnamed condition',
            'I’ve been diagnosed with an unnamed condition',
            'Мне поставили диагноз X',
            'On m’a diagnostiqué une affection',
            'Me diagnosticaron una afección',
        ];
        const fields = [
            (value: string) => ({ goals: [value] }),
            (value: string) => ({ mixingNote: value }),
            (value: string) => ({
                notes: [
                    {
                        id: '00000000-0000-4000-8000-000000000001',
                        topic: 'style',
                        text: value,
                    },
                ],
            }),
            (value: string) => ({ accommodations: [value] }),
            (value: string) => ({ hobbies: [value] }),
            (value: string) => ({
                languages: [
                    { language: 'en', learning: false, clarification: value },
                ],
            }),
        ];
        it.each(labels)(
            'rejects a label or diagnosis statement in every free-text field: %s',
            (value) => {
                expect(containsPortraitDiagnosticDisclosure(value)).toBe(true);
                for (const field of fields) {
                    expect(() =>
                        validateReusablePortraitItems(field(value)),
                    ).toThrow('Describe what helps you learn');
                }
            },
        );
        it.each([
            'I lose focus during long explanations',
            'Add more examples and short steps',
            'I feel nervous speaking; give me time to answer',
            'Diagnostic language exams are my goal',
            'Мне проще учиться короткими шагами',
            'Je préfère des explications courtes et des exemples',
            'Prefiero explicaciones breves y ejemplos',
        ])(
            'keeps concrete functional needs without inferring diagnoses: %s',
            (value) => {
                expect(containsPortraitDiagnosticDisclosure(value)).toBe(false);
                for (const field of fields)
                    expect(() =>
                        validateReusablePortraitItems(field(value)),
                    ).not.toThrow();
            },
        );
    });
    it('treats explicit mixed-language choices and confirmed notes as meaningful while unknown stays unknown', () => {
        for (const items of [
            { mixedLanguageFrequency: 'sometimes' },
            { mixingNote: 'Mostly English with short Spanish examples' },
            {
                notes: [
                    {
                        id: '00000000-0000-4000-8000-000000000001',
                        topic: 'style',
                        text: 'Give me time to answer',
                    },
                ],
            },
        ]) {
            expect(
                hasMeaningfulPortraitItems(PortraitItemsSchema.parse(items)),
            ).toBe(true);
        }
        expect(
            hasMeaningfulPortraitItems(
                PortraitItemsSchema.parse({ notes: [] }),
            ),
        ).toBe(false);
    });
    it('summarizes sometimes, mixing notes and confirmed notes faithfully in all locales', () => {
        const items = PortraitItemsSchema.parse({
            mixedLanguageFrequency: 'sometimes',
            mixedLanguage: true,
            mixingNote: 'Mostly English with short Spanish examples',
            notes: [
                {
                    id: '00000000-0000-4000-8000-000000000001',
                    topic: 'style',
                    text: 'Give me time to answer',
                },
            ],
        });
        const original = structuredClone(items);
        const expected = {
            en: 'sometimes helpful',
            ru: 'иногда полезны',
            fr: 'parfois utiles',
            es: 'a veces útiles',
        };
        for (const locale of ['en', 'ru', 'fr', 'es'] as const) {
            const summary = summarizePortrait(items, locale);
            expect(summary).toContain(expected[locale]);
            expect(summary).toContain(items.mixingNote);
            expect(summary).toContain(items.notes![0]!.text);
            expect(
                PortraitDocumentSchema.safeParse({
                    items,
                    locale,
                    summary,
                    updatedAt: '2026-10-20T12:00:00.000Z',
                }).success,
            ).toBe(true);
        }
        expect(items).toEqual(original);
        expect(
            summarizePortrait(
                PortraitItemsSchema.parse({ mixedLanguageFrequency: 'avoid' }),
                'en',
            ),
        ).toContain('not preferred');
        expect(
            summarizePortrait(
                PortraitItemsSchema.parse({
                    mixedLanguageFrequency: 'helpful',
                }),
                'en',
            ),
        ).toContain('welcome');
        expect(
            summarizePortrait(
                PortraitItemsSchema.parse({ mixedLanguage: true }),
                'en',
            ),
        ).toContain('welcome');
    });
});
