import { describe, expect, it } from 'vitest';

import { getLocalPrompt } from '../src';

describe('local prompts', () => {
    it('provides a deterministic course builder fallback', () => {
        expect(getLocalPrompt('course-builder')).toContain(
            'language-learning course',
        );
    });
});
