import { describe, expect, it } from 'vitest';

import { getLocalPrompt } from '../src';

describe('local prompts', () => {
    it('provides a deterministic course builder fallback', () => {
        expect(getLocalPrompt('course-builder')).toContain(
            'language-learning course',
        );
    });

    it('keeps dictionary card generation review-only and treats content as data', () => {
        const prompt = getLocalPrompt('dictionary-card-generation-agent');

        expect(prompt).toContain('review-only');
        expect(prompt).toContain('enabled Source and Translation noun entries');
        expect(prompt).toContain('not an optional stylistic addition');
        expect(prompt).toContain('count nouns and mass nouns');
        expect(prompt).toContain(
            'taf meaning informal work should become le taf',
        );
        expect(prompt).toContain('preserve its meaning and informal register');
        expect(prompt).toContain('gender, number, and elision');
        expect(prompt).toContain(
            'Keep an existing correct article exactly once',
        );
        expect(prompt).toContain(
            'verbs, adjectives, proper names, full sentences',
        );
        expect(prompt).toContain('dictionary convention omits them');
        expect(prompt).toContain('For languages with grammatical gender');
        expect(prompt).toContain('untrusted learner content');
        expect(prompt).toContain('Do not use tools');
        expect(prompt).toContain('explicitly accept');
    });

    it('keeps inline card authoring atomic, targeted, and review-only', () => {
        const prompt = getLocalPrompt('dictionary-card-authoring-agent');

        expect(prompt).toContain('atomic review-only values');
        expect(prompt).toContain('only the explicitly requested fields');
        expect(prompt).toContain('isolated lexical entry');
        expect(prompt).toContain('phrase or sentence');
        expect(prompt).toContain('la femme a mangé');
        expect(prompt).toContain('natural article');
        expect(prompt).toContain('grammatical gender');
        expect(prompt).toContain('must expose its grammatical gender');
        expect(prompt).toContain('French `parasol` must become `le parasol`');
        expect(prompt).toContain('French `but` must become `le but`');
        expect(prompt).toContain(
            'Do not reinterpret a Source token as another language',
        );
        expect(prompt).toContain(
            'A bare isolated common noun is not already suitable',
        );
        expect(prompt).toContain('`(m)` or `(f)`');
        expect(prompt).toContain('verbs, proper nouns');
        expect(prompt).toContain('both count nouns and mass nouns');
        expect(prompt).toContain(
            'French `taf` meaning informal work must become `le taf`',
        );
        expect(prompt).toContain(
            'preserving its meaning and informal register',
        );
        expect(prompt).toContain(
            'Keep an existing correct article exactly once',
        );
        expect(prompt).not.toContain('proper nouns, mass nouns');
        expect(prompt).toContain('translate the newly generated Example');
        expect(prompt).toContain('server assigns stable identities');
        expect(prompt).toContain(
            'distinct from its current and excluded values',
        );
        expect(prompt).toContain(
            'omit that field instead of repeating a value or failing the whole response',
        );
        expect(prompt).toContain('Do not use tools');
    });

    it('keeps pasted-term generation ordered, row-complete, and review-only', () => {
        const prompt = getLocalPrompt(
            'dictionary-pasted-terms-generation-agent',
        );

        expect(prompt).toContain('ordered, bounded chunk');
        expect(prompt).toContain('untrusted learner content');
        expect(prompt).toContain('Resolve every input row exactly once');
        expect(prompt).toContain('Do not merge, reorder, omit, or invent rows');
        expect(prompt).toContain('explicitly accept');
    });

    it('keeps imported core pairs immutable during optional AI enrichment', () => {
        const prompt = getLocalPrompt(
            'dictionary-import-pairs-generation-agent',
        );
        expect(prompt).toContain(
            'trusted server-parsed bilingual import pairs',
        );
        expect(prompt).toContain('untrusted data');
        expect(prompt).toContain(
            'Preserve every source and translation exactly',
        );
        expect(prompt).toContain('only fill enabled optional fields');
        expect(prompt).toContain('attributed as mixed');
    });
});
