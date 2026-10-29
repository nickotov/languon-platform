import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    KnowledgeTranscriptionJob,
    SubmitKnowledgeTranscriptionRequest,
} from '@languon/contracts';
import {
    KnowledgeTranscription,
    type KnowledgeTranscriptionProps,
} from '@/fsd/widgets/knowledge-transcription';
import { useSessionStore } from '@/fsd/entities/session';
import { pollTranscription } from '@/fsd/widgets/knowledge-transcription/lib/poll-transcription';
import { render } from './render';
const transport = vi.hoisted(() => ({
    submit: vi.fn(),
    read: vi.fn(),
    cancel: vi.fn(),
}));
vi.mock('@/fsd/widgets/knowledge-transcription/api/transcription-api', () => ({
    transcriptionApi: () => transport,
    TranscriptionApiError: class extends Error {
        constructor(readonly status: number) {
            super('unavailable');
        }
    },
}));
const noteId = '11111111-1111-4111-8111-111111111111',
    assetId = '22222222-2222-4222-8222-222222222222',
    blockId = '33333333-3333-4333-8333-333333333333',
    branchId = '44444444-4444-4444-8444-444444444444';
function job(
    id: string,
    state: KnowledgeTranscriptionJob['state'],
): KnowledgeTranscriptionJob {
    return {
        id,
        noteId,
        assetId,
        state,
        maximumCredits: '4.321',
        result:
            state === 'completed'
                ? {
                      text: '<script>literal transcript</script>',
                      languages: ['en'],
                  }
                : null,
        failureCode: null,
        createdAt: '2026-10-28T00:00:00Z',
        updatedAt: '2026-10-28T00:00:00Z',
    };
}
function fixture() {
    const expected = {
        id: blockId,
        type: 'audio' as const,
        assetId,
        title: 'Uploaded conversation',
    };
    const flush = vi.fn(async () => ({
        branchId,
        branchVersion: 5,
        blocks: [expected],
    }));
    const onApply = vi
        .fn<KnowledgeTranscriptionProps['onApply']>()
        .mockResolvedValue('applied');
    const props: KnowledgeTranscriptionProps = {
        noteId,
        blocks: [expected],
        language: 'en',
        requestWithSession: (callback) => callback('synthetic-token'),
        flush,
        onApply,
    };
    return { props, expected, flush, onApply };
}
beforeEach(() => {
    vi.clearAllMocks();
    transport.submit.mockImplementation(
        async (input: SubmitKnowledgeTranscriptionRequest) =>
            job(input.operationId, 'confirmation-required'),
    );
    transport.cancel.mockImplementation(async (_noteId: string, id: string) =>
        job(id, 'cancelled'),
    );
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});
describe('author audio transcription', () => {
    it('requires explicit maximum-credit confirmation and applies only an inspected working-draft proposal', async () => {
        const { props, expected, flush, onApply } = fixture();
        transport.submit
            .mockImplementationOnce(
                async (input: SubmitKnowledgeTranscriptionRequest) =>
                    job(input.operationId, 'confirmation-required'),
            )
            .mockImplementationOnce(
                async (input: SubmitKnowledgeTranscriptionRequest) =>
                    job(input.operationId, 'completed'),
            );
        const { container } = render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Confirm maximum credits' });
        expect(flush).toHaveBeenCalledTimes(1);
        expect(transport.submit).toHaveBeenCalledTimes(1);
        const first = transport.submit.mock
            .calls[0]![0] as SubmitKnowledgeTranscriptionRequest;
        expect(first).not.toHaveProperty('confirmedMaximumCredits');
        expect(screen.getByText('4.321')).toBeInTheDocument();
        expect(onApply).not.toHaveBeenCalled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Confirm maximum credits' }),
        );
        await screen.findByLabelText('Transcript preview');
        expect(transport.submit.mock.calls[1]![0]).toEqual({
            ...first,
            confirmedMaximumCredits: '4.321',
        });
        expect(container.querySelector('script')).toBeNull();
        expect(screen.getByLabelText('Transcript preview')).toHaveValue(
            '<script>literal transcript</script>',
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Apply transcript to working draft',
            }),
        );
        await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
        expect(onApply.mock.calls[0]![0]).toEqual(expected);
        expect(onApply.mock.calls[0]![1]).toMatchObject({
            id: blockId,
            assetId,
            transcript: {
                language: 'en',
                segments: [{ text: '<script>literal transcript</script>' }],
            },
        });
        expect(
            onApply.mock.calls[0]![1].transcript?.segments[0],
        ).not.toHaveProperty('timing');
        expect(onApply.mock.calls[0]![2]).toEqual({
            noteId,
            branchId,
            branchVersion: 5,
        });
        expect(
            screen.getByText(
                'Transcript applied to the working draft. Save to publish.',
            ),
        ).toBeInTheDocument();
    });
    it('retains the transcript preview when its original audio block changed', async () => {
        const { props, onApply } = fixture();
        onApply.mockResolvedValue('changed');
        transport.submit.mockImplementationOnce(
            async (input: SubmitKnowledgeTranscriptionRequest) =>
                job(input.operationId, 'completed'),
        );
        render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByLabelText('Transcript preview');
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Apply transcript to working draft',
            }),
        );
        await screen.findByText(
            'The audio block changed. Your transcript preview is retained; review the current document before applying.',
        );
        expect(screen.getByLabelText('Transcript preview')).toHaveValue(
            '<script>literal transcript</script>',
        );
    });
    it('retries an ambiguous request with its existing identity and no implicit credit confirmation', async () => {
        const { props } = fixture();
        transport.submit.mockRejectedValueOnce(
            new Error('private upstream text'),
        );
        render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Retry this request' });
        const first = transport.submit.mock.calls[0]![0];
        fireEvent.click(
            screen.getByRole('button', { name: 'Retry this request' }),
        );
        await screen.findByRole('button', { name: 'Confirm maximum credits' });
        expect(transport.submit.mock.calls[1]![0]).toEqual(first);
        expect(first).not.toHaveProperty('confirmedMaximumCredits');
        expect(
            screen.queryByText('private upstream text'),
        ).not.toBeInTheDocument();
    });
    it('cancels only on explicit user action, never when the widget unmounts', async () => {
        const { props } = fixture();
        const { unmount } = render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Confirm maximum credits' });
        unmount();
        expect(transport.cancel).not.toHaveBeenCalled();
        render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Cancel request' });
        fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
        await screen.findByText('The transcription request was cancelled.');
        expect(transport.cancel).toHaveBeenCalledTimes(1);
    });
    it('clears private previews when the signed-in session ends', async () => {
        const { props } = fixture();
        transport.submit.mockImplementationOnce(
            async (input: SubmitKnowledgeTranscriptionRequest) =>
                job(input.operationId, 'completed'),
        );
        render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByLabelText('Transcript preview');
        act(() => useSessionStore.getState().signOut());
        expect(
            screen.queryByLabelText('Transcript preview'),
        ).not.toBeInTheDocument();
    });
    it('does not silently transcribe a different block if the selected source disappeared while flushing', async () => {
        const { props, flush } = fixture();
        flush.mockResolvedValue({ branchId, branchVersion: 6, blocks: [] });
        render(<KnowledgeTranscription {...props} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByText(
            'Transcription could not be completed. Retry this request or cancel it.',
        );
        expect(transport.submit).not.toHaveBeenCalled();
    });
    it('polls at bounded intervals and stops on a terminal result', async () => {
        vi.useFakeTimers();
        const controller = new AbortController();
        const read = vi
            .fn()
            .mockResolvedValueOnce(job(blockId, 'running'))
            .mockResolvedValueOnce(job(blockId, 'completed'));
        const observed = vi.fn();
        const waiting = pollTranscription(
            job(blockId, 'queued'),
            read,
            controller.signal,
            observed,
        );
        await vi.advanceTimersByTimeAsync(2499);
        expect(read).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(read).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(2500);
        expect((await waiting).state).toBe('completed');
        await vi.advanceTimersByTimeAsync(10_000);
        expect(read).toHaveBeenCalledTimes(2);
    });
});
