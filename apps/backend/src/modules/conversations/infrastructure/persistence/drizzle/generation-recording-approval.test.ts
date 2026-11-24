import { describe, expect, it, vi } from 'vitest';
import type { ConversationPersistenceContext } from './conversation-persistence-context';
import type { ConversationsTransaction } from './conversation-source';
import type * as GenerationRunContext from './generation-run-context';
import type { GenerationRunRow } from './generation-run-context';
import {
    prepareGenerationAdmission,
    prepareConversationQuote,
} from './generation-run-admission';
import { recordingAdmissionRequestId } from './generation-request-id';

const { lock, emit } = vi.hoisted(() => ({ lock: vi.fn(), emit: vi.fn() }));
vi.mock('./generation-run-context', async (load) => ({
    ...(await load<typeof GenerationRunContext>()),
    lockGenerationRun: lock,
    emitGenerationRun: emit,
}));

const runId = '00000000-0000-4000-8000-000000000001';
const quoteId = '00000000-0000-4000-8000-000000000002';
const now = new Date('2026-01-01T10:00:00.000Z');
const persistence = { now: () => now } as ConversationPersistenceContext;
const requestId = recordingAdmissionRequestId(runId, 1);
const command = {
    runId,
    expectedRevision: 1,
    kind: 'generation',
    recordingAdmission: true,
} as const;

function run(pauseReason: GenerationRunRow['pauseReason']) {
    return {
        id: runId,
        revision: 1,
        state: 'paused',
        pauseReason,
        activeTurnId: null,
        automation: { expiresAt: '2026-01-01T09:59:59.000Z' },
    } as GenerationRunRow;
}

function transaction() {
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));

    return {
        set,
        tx: { update: () => ({ set }) } as unknown as ConversationsTransaction,
    };
}

describe('durable recording consent', () => {
    it('rejects a delayed quote approval after Stop before touching billing', async () => {
        const { tx, set } = transaction();
        lock.mockResolvedValueOnce(run('stopped'));
        await expect(
            prepareGenerationAdmission(
                persistence,
                tx,
                { ownerId: 'owner' },
                'chat',
                command,
            ),
        ).rejects.toThrow('Recording approval is no longer pending.');

        expect(set).not.toHaveBeenCalled();
    });

    it('rejects a new command identifier while the original recording decision is pending', async () => {
        const { tx, set } = transaction();
        lock.mockResolvedValueOnce(run('recording-confirmation'));
        await expect(
            prepareGenerationAdmission(
                persistence,
                tx,
                { ownerId: 'owner' },
                'chat',
                {
                    runId,
                    expectedRevision: 1,
                    kind: 'generation',
                },
            ),
        ).rejects.toThrow('Recording approval is no longer pending.');

        expect(set).not.toHaveBeenCalled();
    });

    it('stores the real quote under its original command and replays an identical offer without an event write', async () => {
        const { tx, set } = transaction();
        const candidate = run('recording-confirmation');
        const quote = {
            id: quoteId,
            maximumCredits: '2',
            approximateOutputTokens: 128,
            expiresAt: '2026-01-01T10:10:00.000Z',
            scope: 'listening-lesson',
        } as const;

        await expect(
            prepareConversationQuote(
                persistence,
                tx,
                candidate,
                requestId,
                quote,
            ),
        ).resolves.toEqual({ quote });

        const approval = { requestId, quote };
        expect(set).toHaveBeenCalledWith(
            expect.objectContaining({
                automation: expect.objectContaining({
                    recordingApproval: approval,
                }),
            }),
        );

        candidate.automation!.recordingApproval = approval;
        await prepareConversationQuote(
            persistence,
            tx,
            candidate,
            requestId,
            quote,
        );

        expect(set).toHaveBeenCalledTimes(1);
    });
});
