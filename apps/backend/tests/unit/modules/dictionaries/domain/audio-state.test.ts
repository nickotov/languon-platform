import { describe, expect, it } from 'vitest';
import { audioJobStateAfterOwnerInterruption } from '../../../../../src/modules/dictionaries/domain/audio';

describe('audio owner interruption state policy', () => {
    it.each([
        'submitting',
        'waiting_provider',
        'storing',
        'submission_unknown',
    ])('preserves no-resubmit intent for %s', (state) => {
        expect(audioJobStateAfterOwnerInterruption(state)).toBe(
            'submission_unknown',
        );
    });
    it.each(['ready', 'failed', 'cancelled'])(
        'preserves completed state %s',
        (state) => {
            expect(audioJobStateAfterOwnerInterruption(state)).toBe(state);
        },
    );
    it('only cancels definitely unsubmitted work', () => {
        expect(audioJobStateAfterOwnerInterruption('queued')).toBe('cancelled');
    });
});
