import { describe, expect, it } from 'vitest';
import { sanitizeAudioMeasurement } from '../../../../../src/modules/dictionaries/application/ports/dictionary-audio-measurement';

const sample = {
    schemaVersion: 1 as const,
    queueQueuedCount: 2,
    queueSubmittingCount: 1,
    queueWaitingProviderCount: 3,
    queueStoringCount: 0,
    submissionUnknownCount: 4,
    liveLeaseCount: 1,
    reservedDailyCostUnits: 250,
    cleanupPendingCount: 2,
    cleanupOldestAgeMs: 86400000,
};
describe('pronunciation operational measurement', () => {
    it('emits only the fixed aggregate schema, discarding identifiers, text and provider URLs', () => {
        const result = sanitizeAudioMeasurement({
            ...sample,
            text: 'private example',
            userId: 'private-owner',
            taskId: 'upstream',
            url: 'https://private.test/audio',
        } as typeof sample);
        expect(result).toEqual(sample);
        expect(Object.keys(result).sort()).toEqual(Object.keys(sample).sort());
        expect(JSON.stringify(result)).not.toMatch(/private|upstream|https/);
    });
    it('rejects provider-shaped values, negative and nonfinite totals', () => {
        for (const invalid of [
            -1,
            Number.NaN,
            Number.POSITIVE_INFINITY,
            'private text',
        ]) {
            expect(() =>
                sanitizeAudioMeasurement({
                    ...sample,
                    reservedDailyCostUnits: invalid,
                } as typeof sample),
            ).toThrow('Invalid pronunciation measurement');
        }
    });
});
