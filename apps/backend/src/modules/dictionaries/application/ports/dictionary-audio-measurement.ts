export interface DictionaryAudioMeasurement {
    schemaVersion: 1;
    queueQueuedCount: number;
    queueSubmittingCount: number;
    queueWaitingProviderCount: number;
    queueStoringCount: number;
    submissionUnknownCount: number;
    liveLeaseCount: number;
    reservedDailyCostUnits: number;
    cleanupPendingCount: number;
    cleanupOldestAgeMs: number;
}

/** Explicit allowlist: provider text, identifiers and URLs never become fields. */
export function sanitizeAudioMeasurement(
    value: DictionaryAudioMeasurement,
): DictionaryAudioMeasurement {
    const count = (value: number) => {
        if (!Number.isSafeInteger(value) || value < 0)
            throw new Error('Invalid pronunciation measurement.');
        return value;
    };
    return {
        schemaVersion: 1,
        queueQueuedCount: count(value.queueQueuedCount),
        queueSubmittingCount: count(value.queueSubmittingCount),
        queueWaitingProviderCount: count(value.queueWaitingProviderCount),
        queueStoringCount: count(value.queueStoringCount),
        submissionUnknownCount: count(value.submissionUnknownCount),
        liveLeaseCount: count(value.liveLeaseCount),
        reservedDailyCostUnits: count(value.reservedDailyCostUnits),
        cleanupPendingCount: count(value.cleanupPendingCount),
        cleanupOldestAgeMs: count(value.cleanupOldestAgeMs),
    };
}
