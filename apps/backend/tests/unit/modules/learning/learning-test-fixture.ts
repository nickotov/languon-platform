import { vi } from 'vitest';
import {
    LearningService,
    type LearningServiceDependencies,
} from '../../../../src/modules/learning/application/learning-service';
import type { LearningStore } from '../../../../src/modules/learning/application/ports/learning-store';
import type { RateLimiter } from '../../../../src/modules/authentication/application/ports/rate-limiter';

export function fixture(enabled = true) {
    const store = {
        listEntries: vi.fn<LearningStore['listEntries']>(),
        getPreferences: vi.fn<LearningStore['getPreferences']>(),
        savePreferences: vi.fn<LearningStore['savePreferences']>(),
        prepare: vi.fn<LearningStore['prepare']>(),
        items: vi.fn<LearningStore['items']>(),
        progress: vi.fn<LearningStore['progress']>(),
        recordAttempt: vi.fn<LearningStore['recordAttempt']>(),
        undo: vi.fn<LearningStore['undo']>(),
    };
    const dependencies = {
        authentication: {
            authenticate: vi.fn(async () => ({
                userId: 'learner',
                sessionId: 'session',
            })),
        },
        clock: { now: () => new Date('2026-10-02T12:00:00Z') },
        cryptography: {
            fingerprint: vi.fn(() => 'opaque-subject'),
            verifyShare: vi.fn(() => true),
            issueShare: vi.fn(),
            shareDigest: vi.fn(),
        },
        dictionaries: {
            findSharedCandidate: vi.fn(async () => ({
                dictionaryId: 'dictionary',
                shareDigest: 'digest',
                shareVersion: 1,
            })),
        },
        enabled,
        rateLimiter: {
            consume: vi.fn<RateLimiter['consume']>(async () => ({
                allowed: true,
                limit: 180,
                remaining: 179,
                retryAfterSeconds: 1,
            })),
            linkSubject: vi.fn(),
        },
        store,
    } satisfies LearningServiceDependencies;
    return { service: new LearningService(dependencies), dependencies, store };
}
