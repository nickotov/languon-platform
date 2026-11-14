import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import { learningContentLimitationCopy } from './learning-content-limitations';

describe('named activity limitation guidance', () => {
    it.each([
        'activity-count-conflict',
        'activity-prerequisite',
        'task-dependency',
    ] as const)(
        'provides useful localized guidance for %s in every supported reply language',
        (code) => {
            const english = learningContentLimitationCopy('en', code);
            for (const language of SUPPORTED_LANGUAGE_TAGS) {
                const text = learningContentLimitationCopy(language, code);
                expect(text.length).toBeGreaterThan(20);
                expect(text).not.toContain('undefined');
                if (language !== 'en') {
                    expect(text).not.toBe(english);
                }
            }
        },
    );
});
