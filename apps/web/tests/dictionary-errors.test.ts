import { describe, expect, it } from 'vitest';
import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import type { Translate } from '@/fsd/shared/i18n';

const t: Translate = (key) => key;
describe('safe dictionary recovery messages', () => {
    it.each([
        ['rate_limited', 'dictionary.error.rateLimited'],
        ['owner_capacity_exceeded', 'dictionary.error.capacity'],
        ['card_capacity_exceeded', 'dictionary.error.capacity'],
        [
            'recent_authentication_required',
            'error.recent_authentication_required',
        ],
        ['generation_not_available', 'dictionary.generation.error.unavailable'],
        [
            'ai_credits_exhausted',
            'dictionary.generation.error.creditsExhausted',
        ],
    ] as const)(
        'distinguishes admission failure %s without exposing its payload',
        (code, key) => {
            expect(
                dictionaryErrorMessage(
                    new DictionaryApiError(429, {
                        code,
                        message: 'opaque provider detail',
                    }),
                    t,
                ),
            ).toBe(key);
        },
    );
    it('distinguishes a failed connection from an opaque unexpected error', () => {
        expect(
            dictionaryErrorMessage(new TypeError('Failed to fetch'), t),
        ).toBe('dictionary.error.network');
        expect(dictionaryErrorMessage(new Error('opaque detail'), t)).toBe(
            'dictionary.error.generic',
        );
    });
});
