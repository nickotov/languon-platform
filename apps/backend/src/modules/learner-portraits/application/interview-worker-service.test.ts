import { describe, expect, it, vi } from 'vitest';
import { InterviewWorkerService } from './interview-worker-service';
import type { ClaimedInterviewOperation } from './ports/interview-store';
const operation: ClaimedInterviewOperation = {
    id: 'operation',
    interviewId: 'session',
    ownerId: 'owner',
    generation: 0,
    version: 0,
    state: 'running',
    input: { kind: 'skip', topic: 'age' },
    context: {
        locale: 'en',
        approvedItems: null,
        draftItems: null,
        messages: [],
        completedTopics: [],
    },
    execution: {},
    result: null,
    errorCode: null,
    leaseToken: 'lease',
};
const result = {
    message: 'Ready to review?',
    topic: 'update' as const,
    options: [],
    multiSelect: false,
};
const fixture = () => ({
    claim: vi.fn().mockResolvedValue(operation),
    heartbeat: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
});
describe('durable interview worker', () => {
    it('claims, checks the fence and persists validated result without approving', async () => {
        const store = fixture();
        const run = vi.fn().mockResolvedValue(result);
        const worker = new InterviewWorkerService({
            store,
            createRunner: () => ({ run }),
        });
        expect(await worker.processNext(new AbortController().signal)).toBe(
            true,
        );
        expect(store.heartbeat).toHaveBeenCalledWith(operation);
        expect(store.complete).toHaveBeenCalledWith(
            operation,
            result,
            expect.any(Date),
        );
        expect(store.fail).not.toHaveBeenCalled();
    });
    it('never creates the runner after deletion or stop invalidates the lease', async () => {
        const store = fixture();
        store.heartbeat.mockRejectedValue(new Error('deleted'));
        const createRunner = vi.fn();
        const worker = new InterviewWorkerService({ store, createRunner });
        await worker.processNext(new AbortController().signal);
        expect(createRunner).not.toHaveBeenCalled();
        expect(store.fail).toHaveBeenCalledOnce();
        expect(store.complete).not.toHaveBeenCalled();
    });
    it('does not automatically redispatch a failed generation', async () => {
        const store = fixture();
        const run = vi
            .fn()
            .mockRejectedValue(new Error('ambiguous provider failure'));
        await new InterviewWorkerService({
            store,
            createRunner: () => ({ run }),
        }).processNext(new AbortController().signal);
        expect(run).toHaveBeenCalledOnce();
        expect(store.fail).toHaveBeenCalledWith(
            operation,
            'generation_failed',
            expect.any(Date),
        );
    });
});
