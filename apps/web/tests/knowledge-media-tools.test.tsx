import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
    KnowledgeTranscriptionJob,
    LearningBlock,
    SpeechResponse,
    SubmitKnowledgeTranscriptionRequest,
} from '@languon/contracts';
import { I18nProvider } from '@/fsd/shared/i18n';
import type * as SpeechPlayback from '@/fsd/features/speech-playback';
import { en } from '@/fsd/shared/i18n/messages/en';
import { KnowledgeMediaTools } from '@/fsd/pages/knowledge/ui/knowledge-detail-page/knowledge-media-tools';

const transport = vi.hoisted(() => ({
    speechPrepare: vi.fn(),
    speechBytes: vi.fn(),
    transcriptionSubmit: vi.fn(),
}));
vi.mock('@/fsd/features/speech-playback', async (original) => ({
    ...(await original<typeof SpeechPlayback>()),
    speechApi: () => ({
        prepare: transport.speechPrepare,
        bytes: transport.speechBytes,
    }),
}));
vi.mock('@/fsd/widgets/knowledge-transcription/api/transcription-api', () => ({
    transcriptionApi: () => ({ submit: transport.transcriptionSubmit }),
    TranscriptionApiError: class extends Error {},
}));

const noteId = '11111111-1111-4111-8111-111111111111';
const branchId = '22222222-2222-4222-8222-222222222222';
const blockId = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';
const textBlock: LearningBlock = {
    type: 'bilingual-text',
    id: blockId,
    language: 'fr',
    segments: [{ id: assetId, text: 'Bonjour.' }],
    translations: [],
};
const audioBlock: LearningBlock = { type: 'audio', id: blockId, assetId };

function deferred<Value>() {
    let resolve!: (value: Value) => void;
    const promise = new Promise<Value>((finish) => {
        resolve = finish;
    });
    return { promise, resolve };
}

function fixture(block: LearningBlock) {
    const flush = vi.fn(async () => ({
        branchId,
        branchVersion: 5,
        blocks: [block],
    }));
    const onNarrationApply = vi.fn();
    const onTranscriptionApply = vi.fn().mockResolvedValue('missing');
    function Tools({ blocks }: { blocks: LearningBlock[] }) {
        const common = {
            noteId,
            blocks,
            flush,
            requestWithSession: <Value,>(
                callback: (token: string) => Promise<Value>,
            ) => callback('synthetic-token'),
        };
        return (
            <I18nProvider locale='en' messages={en}>
                <KnowledgeMediaTools
                    narration={{ ...common, onApply: onNarrationApply }}
                    transcription={{
                        ...common,
                        language: 'fr',
                        onApply: onTranscriptionApply,
                    }}
                />
            </I18nProvider>
        );
    }
    return { Tools, onNarrationApply, onTranscriptionApply };
}

function transcriptionJob(
    operationId: string,
    state: KnowledgeTranscriptionJob['state'],
): KnowledgeTranscriptionJob {
    return {
        id: operationId,
        noteId,
        assetId,
        state,
        maximumCredits: '4.321',
        result:
            state === 'completed'
                ? { text: 'Bonjour.', languages: ['fr'] }
                : null,
        failureCode: null,
        createdAt: '2026-10-29T00:00:00Z',
        updatedAt: '2026-10-29T00:00:00Z',
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    transport.speechBytes.mockResolvedValue(new Blob(['wave']));
    URL.createObjectURL = vi.fn(() => 'blob:retained-preview');
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it('keeps a pending narration and its inspected preview when the last source block is removed', async () => {
    const pending = deferred<SpeechResponse>();
    transport.speechPrepare.mockReturnValue(pending.promise);
    const { Tools, onNarrationApply } = fixture(textBlock);
    const { rerender } = render(<Tools blocks={[textBlock]} />);
    fireEvent.click(screen.getByText('Audio tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Generate audio' }));
    await waitFor(() =>
        expect(transport.speechPrepare).toHaveBeenCalledTimes(1),
    );
    const signal = transport.speechPrepare.mock.calls[0]![1] as AbortSignal;

    rerender(<Tools blocks={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Preparing audio…');
    expect(signal.aborted).toBe(false);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await act(async () => {
        pending.resolve({
            state: 'ready',
            requestId: branchId,
            playbackId: assetId,
            quote: null,
            fixture: true,
            retryAfterMs: null,
            error: null,
            billingState: 'charged_success',
        });
    });
    await screen.findByRole('button', { name: 'Apply audio block' });
    expect(transport.speechBytes).toHaveBeenCalledWith(assetId, signal);
    expect(onNarrationApply).not.toHaveBeenCalled();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Audio tools'));
    fireEvent.click(screen.getByText('Audio tools'));
    expect(
        screen.getByRole('button', { name: 'Apply audio block' }),
    ).toBeEnabled();
    expect(transport.speechPrepare).toHaveBeenCalledTimes(1);
});

it('retains transcription consent and its preview after removing the audio, and never applies it implicitly', async () => {
    const pending = deferred<KnowledgeTranscriptionJob>();
    transport.transcriptionSubmit.mockReturnValueOnce(pending.promise);
    const { Tools, onTranscriptionApply } = fixture(audioBlock);
    const { rerender } = render(<Tools blocks={[audioBlock]} />);
    fireEvent.click(screen.getByText('Audio tools'));
    fireEvent.click(
        screen.getByRole('button', { name: 'Prepare transcription' }),
    );
    await waitFor(() =>
        expect(transport.transcriptionSubmit).toHaveBeenCalledTimes(1),
    );
    const input = transport.transcriptionSubmit.mock
        .calls[0]![0] as SubmitKnowledgeTranscriptionRequest;
    const signal = transport.transcriptionSubmit.mock
        .calls[0]![1] as AbortSignal;

    rerender(<Tools blocks={[]} />);
    expect(signal.aborted).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent(
        'Preparing transcription…',
    );
    expect(
        screen.queryByRole('button', { name: 'Prepare transcription' }),
    ).not.toBeInTheDocument();
    await act(async () => {
        pending.resolve(
            transcriptionJob(input.operationId, 'confirmation-required'),
        );
    });
    await screen.findByRole('button', { name: 'Confirm maximum credits' });
    expect(
        screen.getByRole('button', { name: 'Cancel request' }),
    ).toBeEnabled();
    expect(input).not.toHaveProperty('confirmedMaximumCredits');
    expect(transport.transcriptionSubmit).toHaveBeenCalledTimes(1);
    transport.transcriptionSubmit.mockResolvedValueOnce(
        transcriptionJob(input.operationId, 'completed'),
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Confirm maximum credits' }),
    );
    await screen.findByLabelText('Transcript preview');
    expect(screen.getByLabelText('Transcript preview')).toHaveValue('Bonjour.');
    expect(transport.transcriptionSubmit.mock.calls[1]![0]).toEqual({
        ...input,
        confirmedMaximumCredits: '4.321',
    });
    expect(onTranscriptionApply).not.toHaveBeenCalled();
    fireEvent.click(
        screen.getByRole('button', {
            name: 'Apply transcript to working draft',
        }),
    );
    await screen.findByText(
        'The audio block changed. Your transcript preview is retained; review the current document before applying.',
    );
    expect(onTranscriptionApply.mock.calls[0]![0]).toEqual(audioBlock);
    expect(screen.getByLabelText('Transcript preview')).toHaveValue('Bonjour.');
});
