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
    KnowledgeAudioTranscription,
    type KnowledgeTranscriptionProps,
} from '@/fsd/widgets/knowledge-transcription';
import { TranscriptionApiError } from '@/fsd/widgets/knowledge-transcription/api/transcription-api';
import { useSessionStore } from '@/fsd/entities/session';
import { captureTranscription } from '@/fsd/widgets/knowledge-transcription/lib/transcription-proposal';
import { pollTranscription } from '@/fsd/widgets/knowledge-transcription/lib/poll-transcription';
import { render } from './render';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
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
    it('keeps the requested transcript language when the language control changes after completion', async () => {
        const { props, onApply } = fixture();
        transport.submit.mockImplementationOnce(
            async (input: SubmitKnowledgeTranscriptionRequest) => ({
                ...job(input.operationId, 'completed'),
                result: { text: 'Bonjour', languages: ['fr'] },
            }),
        );
        render(<KnowledgeTranscription {...props} language='fr' />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByLabelText('Transcript preview');
        fireEvent.change(screen.getByLabelText('Transcript language'), {
            target: { value: 'es' },
        });
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Apply transcript to working draft',
            }),
        );
        await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
        expect(transport.submit.mock.calls[0]![0].languages).toEqual(['fr']);
        expect(onApply.mock.calls[0]![1].transcript).toMatchObject({
            language: 'fr',
            segments: [{ text: 'Bonjour' }],
        });
    });
    it('requires a recording before requesting transcription of an unprepared audio block', () => {
        expect(() =>
            captureTranscription(
                noteId,
                {
                    branchId,
                    branchVersion: 1,
                    blocks: [
                        {
                            id: blockId,
                            type: 'audio',
                            sourceText: 'Prepare later.',
                        },
                    ],
                },
                blockId,
                'en',
            ),
        ).toThrow('Add a recording');
        expect(transport.submit).not.toHaveBeenCalled();
    });

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

describe('audio dialog transcription', () => {
    function localFixture() {
        const { props, expected, flush } = fixture();
        const onAccept = vi.fn();
        // The recording is newly selected in this dialog and has not been inserted in the note.
        flush.mockResolvedValue({ branchId, branchVersion: 8, blocks: [] });
        const local = {
            noteId,
            branchId,
            block: expected,
            language: 'en',
            requestWithSession: props.requestWithSession,
            flush,
            onAccept,
        };
        return { local, onAccept, flush };
    }
    function complete() {
        transport.submit.mockImplementationOnce(
            async (input: SubmitKnowledgeTranscriptionRequest) =>
                job(input.operationId, 'completed'),
        );
    }
    it('uses the current outer language when preparing the focused audio draft', async () => {
        const { local } = localFixture();
        const view = render(<KnowledgeAudioTranscription {...local} />);
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <KnowledgeAudioTranscription {...local} language='fr' />
            </I18nProvider>,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Confirm maximum credits' });
        expect(transport.submit.mock.calls[0]![0].languages).toEqual(['fr']);
    });
    it('previews a local recording transcript and accepts only into the dialog without another note flush', async () => {
        const { local, onAccept, flush } = localFixture();
        complete();
        render(<KnowledgeAudioTranscription {...local} />);
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('Transcript language'),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByLabelText('Transcript preview');
        expect(onAccept).not.toHaveBeenCalled();
        expect(local.block).not.toHaveProperty('transcript');
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Apply transcript to audio draft',
            }),
        );
        await waitFor(() => expect(onAccept).toHaveBeenCalledOnce());
        expect(onAccept.mock.calls[0]![0]).toMatchObject({
            assetId,
            transcript: {
                segments: [{ text: '<script>literal transcript</script>' }],
            },
        });
        expect(local.block).not.toHaveProperty('transcript');
        expect(flush).toHaveBeenCalledOnce();
        expect(transport.cancel).not.toHaveBeenCalled();
    });
    it('retains the transcript preview but refuses to overwrite a changed local audio draft', async () => {
        const { local, onAccept } = localFixture();
        complete();
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByLabelText('Transcript preview');
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <KnowledgeAudioTranscription
                    {...local}
                    block={{ ...local.block, title: 'Changed audio' }}
                />
            </I18nProvider>,
        );
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Apply transcript to audio draft',
            }),
        );
        await screen.findByText(/The audio block changed/);
        expect(onAccept).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Transcript preview')).toHaveValue(
            '<script>literal transcript</script>',
        );
    });
    it('retains a prepared quote across unrelated rerenders and cancels on dialog close', async () => {
        const { local } = localFixture();
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Confirm maximum credits' });
        const operationId = transport.submit.mock.calls[0]![0].operationId;
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <KnowledgeAudioTranscription
                    {...local}
                    block={{ ...local.block }}
                    flush={async () => ({
                        branchId,
                        branchVersion: 9,
                        blocks: [],
                    })}
                />
            </I18nProvider>,
        );
        expect(
            screen.getByRole('button', { name: 'Confirm maximum credits' }),
        ).toBeInTheDocument();
        expect(transport.submit).toHaveBeenCalledOnce();
        view.unmount();
        expect(transport.cancel).toHaveBeenCalledWith(
            noteId,
            operationId,
            expect.any(AbortSignal),
        );
    });
    it('discards a completed local preview on close without cancelling completed work or accepting it', async () => {
        const { local, onAccept } = localFixture();
        complete();
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByLabelText('Transcript preview');
        view.unmount();
        expect(transport.cancel).not.toHaveBeenCalled();
        expect(onAccept).not.toHaveBeenCalled();
    });
    it('reads back bounded admission after close and cancels again when the early cancellation raced the POST', async () => {
        const { local, onAccept } = localFixture();
        let resolve!: (value: KnowledgeTranscriptionJob) => void;
        transport.submit.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        transport.cancel.mockRejectedValueOnce(new TranscriptionApiError(404));
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await waitFor(() => expect(transport.submit).toHaveBeenCalledOnce());
        const [input, signal] = transport.submit.mock.calls[0]!;
        view.unmount();
        expect(signal.aborted).toBe(false);
        expect(transport.cancel).toHaveBeenCalledOnce();
        await act(async () => resolve(job(input.operationId, 'queued')));
        await waitFor(() => expect(transport.cancel).toHaveBeenCalledTimes(2));
        expect(transport.cancel.mock.calls[1]!.slice(0, 2)).toEqual([
            noteId,
            input.operationId,
        ]);
        expect(transport.read).not.toHaveBeenCalled();
        expect(onAccept).not.toHaveBeenCalled();
    });
    it('limits detached admission readback to thirty seconds', async () => {
        vi.useFakeTimers();
        const { local, onAccept } = localFixture();
        transport.submit.mockImplementationOnce(
            (
                _input: SubmitKnowledgeTranscriptionRequest,
                signal: AbortSignal,
            ) =>
                new Promise((_resolve, reject) =>
                    signal.addEventListener(
                        'abort',
                        () => reject(new Error('aborted')),
                        { once: true },
                    ),
                ),
        );
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await act(async () => {
            await Promise.resolve();
        });
        expect(transport.submit).toHaveBeenCalledOnce();
        const signal = transport.submit.mock.calls[0]![1] as AbortSignal;
        view.unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(signal.aborted).toBe(true);
        expect(transport.read).not.toHaveBeenCalled();
        expect(onAccept).not.toHaveBeenCalled();
    });
    it('cancels a late admission after explicit Cancel raced the initial POST commit', async () => {
        const { local, onAccept } = localFixture();
        let resolve!: (value: KnowledgeTranscriptionJob) => void;
        transport.submit.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        transport.cancel.mockRejectedValueOnce(new TranscriptionApiError(404));
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await waitFor(() => expect(transport.submit).toHaveBeenCalledOnce());
        const [input, signal] = transport.submit.mock.calls[0]!;
        // An unrelated dialog render must not reset the still-admitting request.
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <KnowledgeAudioTranscription
                    {...local}
                    block={{ ...local.block }}
                />
            </I18nProvider>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
        await waitFor(() => expect(transport.cancel).toHaveBeenCalledOnce());
        expect(signal.aborted).toBe(false);
        await act(async () => resolve(job(input.operationId, 'queued')));
        await waitFor(() => expect(transport.cancel).toHaveBeenCalledTimes(2));
        expect(transport.cancel.mock.calls[1]!.slice(0, 2)).toEqual([
            noteId,
            input.operationId,
        ]);
        expect(transport.read).not.toHaveBeenCalled();
        expect(
            screen.queryByLabelText('Transcript preview'),
        ).not.toBeInTheDocument();
        expect(onAccept).not.toHaveBeenCalled();
        await screen.findByText('The transcription request was cancelled.');
        expect(
            screen.queryByRole('button', { name: 'Cancel request' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        ).toBeEnabled();
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByRole('button', { name: 'Confirm maximum credits' });
        expect(transport.submit).toHaveBeenCalledTimes(2);
        expect(transport.submit.mock.calls[1]![0].operationId).not.toBe(
            input.operationId,
        );
    });
    it('refuses preparation when the branch changes while the private flush is pending', async () => {
        const { local, onAccept, flush } = localFixture();
        let resolve!: (value: Awaited<ReturnType<typeof local.flush>>) => void;
        flush.mockImplementationOnce(
            () =>
                new Promise((done) => {
                    resolve = done;
                }),
        );
        const view = render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        view.rerender(
            <I18nProvider locale='en' messages={en}>
                <KnowledgeAudioTranscription
                    {...local}
                    branchId='55555555-5555-4555-8555-555555555555'
                />
            </I18nProvider>,
        );
        await act(async () =>
            resolve({ branchId, branchVersion: 8, blocks: [] }),
        );
        expect(transport.submit).not.toHaveBeenCalled();
        expect(onAccept).not.toHaveBeenCalled();
    });
    it('shows honest provider-unavailable feedback and leaves manual transcript editing intact', async () => {
        const { local, onAccept } = localFixture();
        transport.submit.mockRejectedValueOnce(new TranscriptionApiError(503));
        render(<KnowledgeAudioTranscription {...local} />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare transcription' }),
        );
        await screen.findByText(
            'Transcription is unavailable with the current provider, pricing or credit configuration.',
        );
        expect(
            screen.queryByLabelText('Transcript preview'),
        ).not.toBeInTheDocument();
        expect(onAccept).not.toHaveBeenCalled();
        expect(local.block).not.toHaveProperty('transcript');
    });
});
