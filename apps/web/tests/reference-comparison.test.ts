import { describe, expect, it } from 'vitest';
import { compareReferenceAnswer } from '@/fsd/features/sentence-training/lib/reference-comparison';

describe('free saved-reference comparison', () => {
    it('normalizes Unicode composition, locale case, punctuation boundaries, whitespace and apostrophe styles while retaining the originals', () => {
        const answer = '  J’AI un cafe\u0301, aujourd’hui ! ';
        const reference = "J'ai un café aujourd'hui.";
        expect(compareReferenceAnswer(answer, reference, 'fr')).toMatchObject({
            kind: 'match',
            answer,
            reference,
            normalizedAnswer: "j'ai un café aujourd'hui",
            ignored: [
                'unicode',
                'apostrophes',
                'case',
                'punctuation',
                'spaces',
            ],
        });
        expect(compareReferenceAnswer('İSTANBUL', 'istanbul', 'tr').kind).toBe(
            'match',
        );
    });
    it.each([
        ['cafe', 'café'],
        ['je suis ici', 'ici suis je'],
        ['bon,jour', 'bonjour'],
        ['j arrive', "j'arrive"],
        ['2 + 3 = 5', '2 3 5'],
        ['10%', '10'],
        ['$20', '20'],
        ['@nick', 'nick'],
        ['#livre', 'livre'],
        ['a/b', 'a b'],
        ['x_y', 'x y'],
        ['a & b', 'a b'],
        ['2-1', '2 1'],
        ['-5', '5'],
        ['3.5', '3 5'],
        ['3,5', '3 5'],
        ['12:30', '12 30'],
        ['🙂', '🙃'],
    ])(
        'keeps meaningful differences between %s and %s',
        (answer, reference) => {
            expect(compareReferenceAnswer(answer, reference).kind).toBe(
                'different',
            );
        },
    );
    it('does not grade an empty answer and treats equivalent punctuation boundaries conservatively', () => {
        expect(compareReferenceAnswer(' \n ', 'Bonjour.')).toMatchObject({
            kind: 'reference-only',
            answer: ' \n ',
            ignored: [],
        });
        expect(
            compareReferenceAnswer('porte-monnaie', 'porte monnaie').kind,
        ).toBe('match');
    });
});
