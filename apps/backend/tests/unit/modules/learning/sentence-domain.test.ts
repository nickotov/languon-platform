import { describe, expect, it } from 'vitest';
import {
    sentenceLanguageMatches,
    sentenceLanguageScript,
    sentenceLetterSqlRange,
} from '../../../../src/modules/learning/domain/sentence-language';
import { selectSentenceCandidates } from '../../../../src/modules/learning/domain/sentence-selection';
import {
    normalizeSentenceHint,
    validateSentenceGeneration,
} from '../../../../src/modules/learning/domain/sentence-content';
import {
    isSentenceSpanValid,
    resolveSentenceIssueSpan,
    sentenceRating,
    validateSentenceCheck,
} from '../../../../src/modules/learning/domain/sentence-feedback';
import type {
    SentenceCheckDraft,
    SentenceCheckInput,
    SentenceGenerationDraft,
    SentenceGenerationInput,
} from '../../../../src/modules/learning/domain/sentence-types';
const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const c = '00000000-0000-4000-8000-000000000003';
const entry = {
    entryId: a,
    learningVersion: 1,
    sourceText: 'walk',
    targetText: 'gehen',
};
const generation: SentenceGenerationInput = {
    schemaVersion: 1,
    generationPolicyVersion: 1,
    dictionaryId: b,
    direction: 'source-to-target',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    priorityEntryId: a,
    candidates: [entry],
};
const content: SentenceGenerationDraft = {
    sourceText: 'We walked and walk.',
    referenceTranslation: 'Wir gingen und gehen.',
    segments: [
        { text: 'We ', entryId: null },
        { text: 'walked', entryId: a },
        { text: ' and ', entryId: null },
        { text: 'walk', entryId: a },
        { text: '.', entryId: null },
    ],
    targets: [{ entryId: a, normalizedHint: 'gehen', hintForm: 'infinitive' }],
};
const check: SentenceCheckInput = {
    schemaVersion: 1,
    exerciseId: b,
    sourceText: content.sourceText,
    referenceTranslation: content.referenceTranslation,
    sourceLanguage: 'en',
    targetLanguage: 'de',
    targets: [entry],
    answer: '  Wir gehen 😀.\n',
    explanationLanguage: 'en',
    revealedHintIds: [],
};
const feedback: SentenceCheckDraft = {
    proposedPercentage: 100,
    meaning: 'correct',
    grammar: 'correct',
    targets: [
        { entryId: a, status: 'used', explanation: 'The target is used.' },
    ],
    issues: [],
    improvedTranslation: 'Wir gehen.',
    explanation: 'Correct.',
};
describe('sentence domain', () => {
    it('rejects French source text for Russian-to-French generation and accepts Russian morphology', () => {
        const input = {
            ...generation,
            sourceLanguage: 'ru' as const,
            targetLanguage: 'fr' as const,
            candidates: [{ ...entry, sourceText: 'работа', targetText: 'taf' }],
        };
        const wrong = {
            sourceText: "J'ai du taf.",
            referenceTranslation: 'У меня работа.',
            segments: [
                { text: "J'ai du ", entryId: null },
                { text: 'taf', entryId: a },
                { text: '.', entryId: null },
            ],
            targets: [
                {
                    entryId: a,
                    normalizedHint: 'taf',
                    hintForm: 'lemma' as const,
                },
            ],
        };
        expect(() => validateSentenceGeneration(input, wrong)).toThrow(
            'Sentence languages',
        );
        const correct = {
            ...wrong,
            sourceText: 'Сегодня у меня много работы.',
            referenceTranslation: "J'ai beaucoup de taf aujourd'hui.",
            segments: [
                { text: 'Сегодня у меня много ', entryId: null },
                { text: 'работы', entryId: a },
                { text: '.', entryId: null },
            ],
        };
        expect(validateSentenceGeneration(input, correct).sourceText).toBe(
            correct.sourceText,
        );
        expect(() =>
            validateSentenceGeneration(input, {
                ...correct,
                referenceTranslation: 'Сегодня у меня много работы.',
            }),
        ).toThrow('Sentence languages');
    });
    it('accepts normal foreign names and loans without accepting a reversed sentence', () => {
        expect(
            sentenceLanguageMatches('Сегодня Pierre читает книгу.', 'ru', 'fr'),
        ).toBe(true);
        expect(
            sentenceLanguageMatches(
                'Je travaille chez Яндекс aujourd’hui.',
                'fr',
                'ru',
            ),
        ).toBe(true);
        expect(
            sentenceLanguageMatches(
                'Сегодня используем Wi-Fi дома.',
                'ru',
                'fr',
            ),
        ).toBe(true);
        expect(sentenceLanguageMatches('Bonjour monde, да.', 'ru', 'fr')).toBe(
            false,
        );
        expect(
            sentenceLanguageMatches('Сегодня много работы, oui.', 'fr', 'ru'),
        ).toBe(false);
        expect(sentenceLanguageMatches('123 + 456 = 579 😀', 'ru', 'fr')).toBe(
            true,
        );
        expect(sentenceLanguageMatches('123 + 456 = 579 😀', 'fr', 'ru')).toBe(
            true,
        );
        // Shared script cannot establish semantic language identity.
        expect(sentenceLanguageMatches('This is English.', 'fr', 'en')).toBe(
            true,
        );
    });
    it('uses letter-only SQL ranges matching runtime script checks beyond historical blocks', () => {
        for (const [text, language, otherLanguage, matches] of [
            ['Hello ١٢٣٤٥٦', 'ar', 'en', false],
            ['مرحبا ١٢٣٤٥٦', 'ar', 'en', true],
            ['Āẞ ẮḀ', 'fr', 'ru', true],
            ['Hello १२३४५६', 'hi', 'en', false],
            ['नमस्ते १२३४५६', 'hi', 'en', true],
            ['Hello ְֱֲֳִֵֶַָ', 'he', 'en', false],
            ['שלום ְֱֲֳִֵֶַָ', 'he', 'en', true],
        ] as const) {
            expect(sentenceLanguageMatches(text, language, otherLanguage)).toBe(
                matches,
            );
            const expected = sentenceLanguageScript(language)!;
            const other = sentenceLanguageScript(otherLanguage)!;
            const allLetters = new RegExp(
                `[${sentenceLetterSqlRange()}]`,
                'gu',
            );
            const expectedLetters = new RegExp(`[${expected.sqlRange}]`, 'gu');
            const otherLetters = new RegExp(`[${other.sqlRange}]`, 'gu');
            const expectedCount = [...text.matchAll(expectedLetters)].length;
            const otherCount = [...text.matchAll(otherLetters)].length;
            const sqlRangeMatch =
                !allLetters.test(text) ||
                (expectedCount > 0 && expectedCount >= otherCount);
            expect(sqlRangeMatch).toBe(matches);
        }
        expect(
            new RegExp(`[${sentenceLanguageScript('ar')!.sqlRange}]`, 'u').test(
                '١',
            ),
        ).toBe(false);
        expect(
            new RegExp(`[${sentenceLanguageScript('hi')!.sqlRange}]`, 'u').test(
                '१',
            ),
        ).toBe(false);
        expect(
            new RegExp(`[${sentenceLanguageScript('he')!.sqlRange}]`, 'u').test(
                'ְ',
            ),
        ).toBe(false);
    });
    it('rejects English source reversal for additional distinct writing scripts', () => {
        for (const [language, text] of [
            ['th', 'วันนี้ฉันอ่านหนังสือ'],
            ['hy', 'Ես այսօր գիրք եմ կարդում'],
            ['ka', 'დღეს წიგნს ვკითხულობ'],
            ['bn', 'আজ আমি বই পড়ি'],
            ['am', 'ዛሬ መጽሐፍ አነባለሁ'],
        ] as const) {
            expect(sentenceLanguageScript(language)).not.toBeNull();
            expect(
                sentenceLanguageMatches('I read a book today.', language, 'en'),
            ).toBe(false);
            expect(sentenceLanguageMatches(text, language, 'en')).toBe(true);
            expect(sentenceLanguageMatches(text, 'en', language)).toBe(false);
        }
    });
    it('prioritizes uncovered entries then least exposure without mutating inputs', () => {
        const entries = [
            { ...entry, entryId: a, exposureCount: 2, sortKey: 1n },
            { ...entry, entryId: b, exposureCount: 0, sortKey: 3n },
            { ...entry, entryId: c, exposureCount: 0, sortKey: 2n },
        ];
        expect(selectSentenceCandidates(entries).map((v) => v.entryId)).toEqual(
            [c, b, a],
        );
        expect(entries[0]?.entryId).toBe(a);
        expect(() => selectSentenceCandidates(entries, 13)).toThrow();
    });
    it('maps repeated inflected source occurrences to one lexical target hint', () => {
        const result = validateSentenceGeneration(generation, content);
        expect(result.segments.map((s) => s.text).join('')).toBe(
            content.sourceText,
        );
        expect(result.hints).toEqual([{ id: 'hint-1', text: 'gehen' }]);
        expect(
            result.segments.filter((s) => s.target).map((s) => s.target),
        ).toEqual([
            { entryId: a, occurrenceId: 'occurrence-1', hintId: 'hint-1' },
            { entryId: a, occurrenceId: 'occurrence-2', hintId: 'hint-1' },
        ]);
        expect(result.segments[0]?.target).toBeNull();
    });
    it('requires unique admitted targets including priority and actual occurrences', () => {
        expect(() =>
            validateSentenceGeneration(generation, {
                ...content,
                targets: [...content.targets, ...content.targets],
            }),
        ).toThrow();
        expect(() =>
            validateSentenceGeneration(generation, {
                ...content,
                targets: [
                    { entryId: c, normalizedHint: 'gehen', hintForm: 'lemma' },
                ],
            }),
        ).toThrow();
        expect(() =>
            validateSentenceGeneration(generation, {
                ...content,
                segments: [{ text: content.sourceText, entryId: null }],
            }),
        ).toThrow();
        expect(() =>
            validateSentenceGeneration(generation, {
                ...content,
                segments: [{ text: 'wrong', entryId: a }],
            }),
        ).toThrow();
    });
    it('accepts three unique targets and rejects a fourth or missing priority', () => {
        const candidates = [
            entry,
            { ...entry, entryId: b, sourceText: 'eat', targetText: 'essen' },
            {
                ...entry,
                entryId: c,
                sourceText: 'drink',
                targetText: 'trinken',
            },
        ];
        const input = { ...generation, candidates };
        const draft: SentenceGenerationDraft = {
            sourceText: 'Walk eat drink.',
            referenceTranslation: 'Gehen essen trinken.',
            segments: [
                { text: 'Walk', entryId: a },
                { text: ' ', entryId: null },
                { text: 'eat', entryId: b },
                { text: ' ', entryId: null },
                { text: 'drink', entryId: c },
                { text: '.', entryId: null },
            ],
            targets: candidates.map((target) => ({
                entryId: target.entryId,
                normalizedHint: target.targetText,
                hintForm: 'infinitive',
            })),
        };
        expect(validateSentenceGeneration(input, draft).targets).toEqual(
            candidates,
        );
        expect(() =>
            validateSentenceGeneration(input, {
                ...draft,
                targets: draft.targets.slice(1),
            }),
        ).toThrow();
        expect(() =>
            validateSentenceGeneration(input, {
                ...draft,
                targets: [
                    ...draft.targets,
                    {
                        ...draft.targets[0]!,
                        entryId: '00000000-0000-4000-8000-000000000004',
                    },
                ],
            }),
        ).toThrow();
    });
    it('accepts normalized irregular lexical forms and unspaced phrases but rejects full reference hints', () => {
        expect(normalizeSentenceHint('  cafe\u0301   au lait ')).toBe(
            'café au lait',
        );
        for (const hint of ['Wir gingen und gehen.'])
            expect(() =>
                validateSentenceGeneration(generation, {
                    ...content,
                    targets: [
                        { entryId: a, normalizedHint: hint, hintForm: 'lemma' },
                    ],
                }),
            ).toThrow();
        const phrase: SentenceGenerationInput = {
            ...generation,
            candidates: [{ ...entry, targetText: 'take care of' }],
            targetLanguage: 'en',
        };
        expect(
            validateSentenceGeneration(phrase, {
                ...content,
                targets: [
                    {
                        entryId: a,
                        normalizedHint: 'take care of',
                        hintForm: 'phrase',
                    },
                ],
            }).hints[0]?.text,
        ).toBe('take care of');
        for (const [targetText, normalizedHint, language] of [
            ['ging', 'gehen', 'de'],
            ['went', 'go', 'en'],
            ['делал', 'делать', 'ru'],
        ] as const) {
            expect(
                validateSentenceGeneration(
                    {
                        ...generation,
                        targetLanguage: language!,
                        candidates: [{ ...entry, targetText: targetText! }],
                    },
                    {
                        ...content,
                        referenceTranslation:
                            language === 'ru'
                                ? 'Мы делали и делаем.'
                                : content.referenceTranslation,
                        targets: [
                            {
                                entryId: a,
                                normalizedHint: normalizedHint!,
                                hintForm: 'infinitive',
                            },
                        ],
                    },
                ).hints[0]?.text,
            ).toBe(normalizedHint);
        }
        expect(
            validateSentenceGeneration(
                {
                    ...generation,
                    targetLanguage: 'zh-Hans',
                    candidates: [{ ...entry, targetText: '照顾' }],
                },
                {
                    ...content,
                    referenceTranslation: '我们照顾家人。',
                    targets: [
                        {
                            entryId: a,
                            normalizedHint: '照顾',
                            hintForm: 'phrase',
                        },
                    ],
                },
            ).hints[0]?.text,
        ).toBe('照顾');
    });
    it('rejects source splits inside combining graphemes and emoji', () => {
        for (const pieces of [
            ['e', '\u0301'],
            ['\ud83d', '\ude00'],
        ])
            expect(() =>
                validateSentenceGeneration(generation, {
                    ...content,
                    sourceText: pieces.join(''),
                    segments: pieces.map((text) => ({ text, entryId: a })),
                }),
            ).toThrow();
    });
    it('uses exact UTF16 grapheme ranges in immutable answers', () => {
        expect(
            isSentenceSpanValid('e\u0301 😀', {
                start: 0,
                end: 2,
                quote: 'e\u0301',
            }),
        ).toBe(true);
        expect(
            isSentenceSpanValid('e\u0301 😀', { start: 0, end: 1, quote: 'e' }),
        ).toBe(false);
        expect(
            isSentenceSpanValid('e\u0301 😀', {
                start: 3,
                end: 5,
                quote: '😀',
            }),
        ).toBe(true);
        expect(
            isSentenceSpanValid('e\u0301 😀', {
                start: 3,
                end: 4,
                quote: '\ud83d',
            }),
        ).toBe(false);
        expect(
            isSentenceSpanValid(check.answer, {
                start: 2,
                end: 5,
                quote: 'wir',
            }),
        ).toBe(false);
    });
    it('derives rating boundaries and caps without penalizing hints', () => {
        expect([100, 99, 80, 79, 50, 49, 0].map(sentenceRating)).toEqual([
            'perfect',
            'good',
            'good',
            'not-bad',
            'not-bad',
            'practise-again-later',
            'practise-again-later',
        ]);
        expect(
            validateSentenceCheck(
                { ...check, revealedHintIds: ['hint-1'] },
                feedback,
            ).percentage,
        ).toBe(100);
        expect(
            validateSentenceCheck(check, {
                ...feedback,
                targets: [{ ...feedback.targets[0]!, status: 'missing' }],
            }).percentage,
        ).toBe(79);
        expect(
            validateSentenceCheck(check, {
                ...feedback,
                grammar: 'substantive-errors',
            }).percentage,
        ).toBe(99);
        expect(
            validateSentenceCheck(check, { ...feedback, meaning: 'partial' })
                .percentage,
        ).toBe(99);
    });
    it('rejects incomplete duplicate targets, mismatched spans and unsafe answers', () => {
        expect(() =>
            validateSentenceCheck(check, { ...feedback, targets: [] }),
        ).toThrow();
        expect(() =>
            validateSentenceCheck(check, {
                ...feedback,
                targets: [...feedback.targets, ...feedback.targets],
            }),
        ).toThrow();
        expect(() =>
            validateSentenceCheck({ ...check, answer: 'a\u0000' }, feedback),
        ).toThrow();
        const issue = {
            kind: 'grammar' as const,
            severity: 'substantive' as const,
            span: { start: 2, end: 5, quote: 'wrong' },
            explanation: 'Wrong.',
            correction: null,
        };
        expect(() =>
            validateSentenceCheck(check, { ...feedback, issues: [issue] }),
        ).toThrow();
        expect(
            validateSentenceCheck(check, {
                ...feedback,
                issues: [{ ...issue, span: null }],
            }).issues[0]?.span,
        ).toBeNull();
    });
    it.each([
        ['  café e\u0301 😀  ', 'café', { start: 2, end: 6, quote: 'café' }],
        [
            '  café e\u0301 😀  ',
            'e\u0301',
            { start: 7, end: 9, quote: 'e\u0301' },
        ],
        ['  café e\u0301 😀  ', '😀', { start: 10, end: 12, quote: '😀' }],
        ['one one', 'one', null],
        ['e\u0301 e', 'e', { start: 3, end: 4, quote: 'e' }],
        ['e\u0301 e e', 'e', null],
        ['aaa', 'aa', null],
        ['e\u0301', 'e', null],
        ['😀', '\ud83d', null],
        ['👩‍💻', '👩', null],
        ['👩‍💻', '👩‍💻', { start: 0, end: 5, quote: '👩‍💻' }],
        ['é', 'e\u0301', null],
        ['one', 'One', null],
        ['abc', '', null],
        ['abc', null, null],
    ])(
        'resolves only exact unique grapheme-aligned quotes in %j',
        (answer, quote, span) => {
            expect(resolveSentenceIssueSpan(answer, quote)).toEqual(span);
        },
    );
    it('distinguishes target inventory, forged spans and immutable input rejection without changing score caps', () => {
        for (const targets of [
            [],
            [...feedback.targets, ...feedback.targets],
            [{ ...feedback.targets[0]!, entryId: c }],
        ]) {
            expect(() =>
                validateSentenceCheck(check, { ...feedback, targets }),
            ).toThrow(
                expect.objectContaining({
                    reason: 'target_assessments_invalid',
                }),
            );
        }
        expect(() =>
            validateSentenceCheck({ ...check, answer: 'a\u0000' }, feedback),
        ).toThrow(expect.objectContaining({ reason: 'input_invalid' }));
        const issue = {
            kind: 'grammar' as const,
            severity: 'minor' as const,
            span: { start: 2, end: 5, quote: 'wrong' },
            explanation: 'Review.',
            correction: null,
        };
        expect(() =>
            validateSentenceCheck(check, { ...feedback, issues: [issue] }),
        ).toThrow(expect.objectContaining({ reason: 'answer_span_invalid' }));
        expect(
            validateSentenceCheck(check, {
                ...feedback,
                issues: [{ ...issue, span: null }],
            }).percentage,
        ).toBe(99);
    });
});
