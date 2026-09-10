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
        expect(prompt).toContain('untrusted learner content');
        expect(prompt).toContain('Do not use tools');
        expect(prompt).toContain('explicitly accept');
    });

    it('keeps inline card authoring atomic, targeted, and review-only', () => {
        const prompt = getLocalPrompt('dictionary-card-authoring-agent');

        expect(prompt).toContain('atomic review-only values');
        expect(prompt).toContain('only the explicitly requested target fields');
        expect(prompt).toContain('never generate or alter Source');
        expect(prompt).toContain('server assigns stable identities');
        expect(prompt).toContain(
            'distinct from its current and excluded values',
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
