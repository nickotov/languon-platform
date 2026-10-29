import { exerciseSource } from '../src/fsd/features/workbook-learning/lib/exercise-source';
import { KnowledgeBodySchema } from '@languon/contracts';
import { VideoPlayer } from '../src/fsd/entities/learning-blocks/ui/media-block/media-block';
import { safeAudioUrl } from '../src/fsd/entities/learning-blocks/lib/safe-audio-url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import {
    LearningBlockView,
    type LearningBlockLabels,
} from '@/fsd/entities/learning-blocks';

const id = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const labels: LearningBlockLabels = {
    kinds: {
        video: 'Video',
        audio: 'Audio',
        vocabulary: 'Vocabulary',
        'bilingual-text': 'Text',
        grammar: 'Grammar',
        exercise: 'Exercise',
    },
    showAnswer: 'Show answer',
    hideAnswer: 'Hide answer',
    retry: 'Retry',
    answer: 'Answer',
    checkWithAi: 'Check with AI',
    hint: 'Hint',
    showTranscript: 'Show transcript',
    hideTranscript: 'Hide transcript',
    replay: 'Replay',
    original: 'Original',
    bilingual: 'Bilingual',
    translationLanguage: 'Translation language',
    mediaUnavailable: 'Media unavailable',
    openVideoSource: 'Open video source',
    rule: 'Rule',
    pattern: 'Pattern',
    examples: 'Examples',
    commonMistakes: 'Common mistakes',
    incorrect: 'Incorrect',
    correct: 'Correct',
};
const exercise: LearningBlock = {
    id,
    type: 'exercise',
    format: 'free-text',
    question: 'What happened?',
    referenceAnswer: 'She left.',
    explanation: 'The passage describes her departure.',
};

describe('reusable learning blocks', () => {
    it('renders hostile text as text rather than HTML', () => {
        const hostile =
            '<img src=x onerror="alert(1)"><script>alert(1)</script>';
        const { container } = render(
            <LearningBlockView
                block={{ id, type: 'grammar', language: 'en', rule: hostile }}
                labels={labels}
            />,
        );
        expect(screen.getByText(hostile)).toBeInTheDocument();
        expect(container.querySelector('script, img')).toBeNull();
    });
    it('keeps answer reveal separate from AI evaluation and supports retry', () => {
        const onInteraction = vi.fn();
        const onEvaluate = vi.fn();
        render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                onInteraction={onInteraction}
                onEvaluate={onEvaluate}
            />,
        );
        expect(screen.queryByText('She left.')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Answer'), {
            target: { value: 'She went away.' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));
        expect(onEvaluate).toHaveBeenCalledWith(id, 'She went away.');
        fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
        expect(screen.getByText('She left.')).toBeInTheDocument();
        expect(onInteraction).toHaveBeenCalledWith(id, {
            kind: 'answer-revealed',
        });
        expect(onEvaluate).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(screen.getByLabelText('Answer')).toHaveValue('');
        expect(screen.queryByText('She left.')).not.toBeInTheDocument();
    });
    it('aligns bilingual translation using source identity instead of array position', () => {
        const block: LearningBlock = {
            id,
            type: 'bilingual-text',
            language: 'en',
            segments: [
                { id: first, text: 'First source' },
                { id: second, text: 'Second source' },
            ],
            translations: [
                {
                    language: 'es',
                    segments: [
                        { sourceSegmentId: second, text: 'Segundo' },
                        { sourceSegmentId: first, text: 'Primero' },
                    ],
                },
            ],
        };
        render(<LearningBlockView block={block} labels={labels} />);
        expect(screen.queryByText('Primero')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Bilingual' }));
        expect(
            screen.getByText('First source').parentElement,
        ).toHaveTextContent('Primero');
        expect(
            screen.getByText('Second source').parentElement,
        ).toHaveTextContent('Segundo');
    });
    it('hides audio transcript and reports disclosure without constructing asset URLs', () => {
        const onInteraction = vi.fn();
        const block: LearningBlock = {
            id,
            type: 'audio',
            assetId: first,
            transcript: {
                language: 'en',
                segments: [{ id: second, text: 'A private transcript' }],
            },
        };
        const { container } = render(
            <LearningBlockView
                block={block}
                labels={labels}
                audioUrl='javascript:alert(1)'
                onInteraction={onInteraction}
            />,
        );
        expect(container.querySelector('audio')).toBeNull();
        expect(screen.getByText('Media unavailable')).toBeInTheDocument();
        expect(
            screen.queryByText('A private transcript'),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Show transcript' }),
        );
        expect(screen.getByText('A private transcript')).toBeInTheDocument();
        expect(onInteraction).toHaveBeenCalledWith(id, {
            kind: 'transcript-revealed',
        });
    });
    it('constructs a fixed YouTube embed without trusting iframe HTML', () => {
        const { container } = render(
            <LearningBlockView
                block={{
                    id,
                    type: 'video',
                    source: { kind: 'youtube', videoId: 'abcdefghijk' },
                }}
                labels={labels}
            />,
        );
        const iframe = container.querySelector('iframe');
        expect(iframe).toHaveAttribute(
            'src',
            'https://www.youtube-nocookie.com/embed/abcdefghijk',
        );
        expect(iframe).toHaveAttribute(
            'sandbox',
            'allow-scripts allow-same-origin allow-presentation',
        );
    });
    it('does not expose a fake AI check action without a supplied evaluator', () => {
        render(<LearningBlockView block={exercise} labels={labels} />);
        expect(
            screen.queryByRole('button', { name: 'Check with AI' }),
        ).not.toBeInTheDocument();
    });
    it('submits multiple-choice identity without deriving correctness from reveal', () => {
        const onEvaluate = vi.fn();
        const block: LearningBlock = {
            id,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Choose a tense',
            referenceAnswer: 'Past',
            explanation: 'A completed event',
            choices: [
                { id: first, text: 'Past' },
                { id: second, text: 'Present' },
            ],
            correctChoiceId: first,
        };
        render(
            <LearningBlockView
                block={block}
                labels={labels}
                onEvaluate={onEvaluate}
            />,
        );
        fireEvent.click(screen.getByLabelText('Present'));
        fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));
        expect(onEvaluate).toHaveBeenCalledWith(id, second);
    });
    it('submits fill-in answers by gap identity', () => {
        const onEvaluate = vi.fn();
        const block: LearningBlock = {
            id,
            type: 'exercise',
            format: 'fill-in-the-blank',
            question: 'Complete the sentence',
            referenceAnswer: 'I went home.',
            explanation: 'Went is past tense.',
            parts: [
                { kind: 'text', text: 'I ' },
                { kind: 'gap', id: first, acceptedAnswers: ['went'] },
                { kind: 'text', text: ' home.' },
            ],
        };
        render(
            <LearningBlockView
                block={block}
                labels={labels}
                onEvaluate={onEvaluate}
            />,
        );
        fireEvent.change(screen.getByLabelText('Answer 2'), {
            target: { value: 'went' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));
        expect(onEvaluate).toHaveBeenCalledWith(id, { [first]: 'went' });
    });
    it('reveals prepared vocabulary without requiring library storage', () => {
        const block: LearningBlock = {
            id,
            type: 'vocabulary',
            language: 'en',
            translationLanguage: 'es',
            entries: [
                {
                    id: first,
                    term: 'book',
                    translation: 'libro',
                    definition: '<script>literal definition</script>',
                },
            ],
        };
        render(<LearningBlockView block={block} labels={labels} />);
        expect(screen.queryByText('libro')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
        expect(screen.getByText('libro')).toBeInTheDocument();
        expect(
            screen.getByText('<script>literal definition</script>'),
        ).toBeVisible();
        expect(document.querySelector('script')).toBeNull();
    });
    it('clears local answers when the authored exercise is replaced', () => {
        const { rerender } = render(
            <LearningBlockView block={exercise} labels={labels} />,
        );
        fireEvent.change(screen.getByLabelText('Answer'), {
            target: { value: 'old answer' },
        });
        rerender(
            <LearningBlockView
                block={{ ...exercise, question: 'What happened next?' }}
                labels={labels}
            />,
        );
        expect(screen.getByLabelText('Answer')).toHaveValue('');
    });
    it('saves an attempt independently of AI evaluation and answer reveal', () => {
        const onSubmitAttempt = vi.fn();
        const onEvaluate = vi.fn();
        const onInteraction = vi.fn();
        render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                onSubmitAttempt={onSubmitAttempt}
                submitAttemptLabel='Save answer'
                onEvaluate={onEvaluate}
                onInteraction={onInteraction}
            />,
        );
        fireEvent.change(screen.getByLabelText('Answer'), {
            target: { value: 'My response' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
        expect(onSubmitAttempt).toHaveBeenCalledWith(id, 'My response');
        expect(onEvaluate).not.toHaveBeenCalled();
        expect(onInteraction).not.toHaveBeenCalled();
    });
    it('accepts trusted host-provided same-origin blob playback and rejects foreign or executable URLs', () => {
        const sameOrigin = `blob:${location.origin}/11111111-1111-4111-8111-111111111111`;
        expect(safeAudioUrl(sameOrigin)).toBe(sameOrigin);
        expect(
            safeAudioUrl('blob:https://untrusted.example/audio'),
        ).toBeUndefined();
        expect(
            safeAudioUrl('data:text/html,<script>alert(1)</script>'),
        ).toBeUndefined();
        expect(safeAudioUrl('javascript:alert(1)')).toBeUndefined();
        expect(safeAudioUrl(`${sameOrigin}\u0000`)).toBeUndefined();
        const { container } = render(
            <LearningBlockView
                block={{ id, type: 'audio', assetId: first }}
                labels={labels}
                audioUrl={sameOrigin}
            />,
        );
        expect(container.querySelector('audio')).toHaveAttribute(
            'src',
            sameOrigin,
        );
    });
    it('replays a timestamped exercise hint through the authorized local audio player', () => {
        const play = vi
            .spyOn(HTMLMediaElement.prototype, 'play')
            .mockResolvedValue();
        const audioUrl = `blob:${location.origin}/11111111-1111-4111-8111-111111111111`;
        const transcript = {
            language: 'en',
            segments: [
                {
                    id: first,
                    text: 'A relevant passage',
                    timing: { startSeconds: 12, endSeconds: 15 },
                },
            ],
        };
        const { container } = render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                audioUrl={audioUrl}
                hintTranscript={transcript}
            />,
        );
        expect(
            screen.queryByText('A relevant passage'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
        expect(container.querySelector('audio')!.currentTime).toBe(12);
        expect(play).toHaveBeenCalledTimes(1);
        play.mockRestore();
    });
    it('replays a timed exercise video hint without revealing the full source transcript or recording an answer', () => {
        const play = vi
            .spyOn(HTMLMediaElement.prototype, 'play')
            .mockResolvedValue();
        const onInteraction = vi.fn();
        const hintTranscript = {
            language: 'en',
            segments: [
                {
                    id: first,
                    text: 'Relevant video passage',
                    timing: { startSeconds: 12, endSeconds: 15 },
                },
            ],
        };
        const { container } = render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                hintTranscript={hintTranscript}
                hintVideoSource={{
                    kind: 'url',
                    url: 'https://media.example/lesson.mp4',
                }}
                onInteraction={onInteraction}
            />,
        );
        expect(container.querySelector('video')).toBeNull();
        expect(
            screen.queryByText('Relevant video passage'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
        expect(container.querySelector('video')).toHaveAttribute(
            'src',
            'https://media.example/lesson.mp4',
        );
        expect(container.querySelector('video')!.currentTime).toBe(12);
        expect(play).toHaveBeenCalledTimes(1);
        expect(onInteraction.mock.calls).toEqual([[id, { kind: 'hint-used' }]]);
        expect(screen.queryByText('She left.')).not.toBeInTheDocument();
        play.mockRestore();
    });
    it('replays a YouTube exercise hint through a fixed timestamped embed and can replay the same passage again', () => {
        const { container } = render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                hintTranscript={{
                    language: 'en',
                    segments: [
                        {
                            id: first,
                            text: 'Relevant YouTube passage',
                            timing: { startSeconds: 12.7, endSeconds: 15 },
                        },
                    ],
                }}
                hintVideoSource={{ kind: 'youtube', videoId: 'abcdefghijk' }}
            />,
        );
        expect(container.querySelector('iframe')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        expect(container.querySelector('iframe')).toHaveAttribute(
            'src',
            'https://www.youtube-nocookie.com/embed/abcdefghijk',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
        const firstFrame = container.querySelector('iframe');
        expect(firstFrame).toHaveAttribute(
            'src',
            'https://www.youtube-nocookie.com/embed/abcdefghijk?start=12&autoplay=1',
        );
        expect(firstFrame).toHaveAttribute(
            'sandbox',
            'allow-scripts allow-same-origin allow-presentation',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
        expect(container.querySelector('iframe')).not.toBe(firstFrame);
        expect(container.querySelector('iframe')).toHaveAttribute(
            'src',
            'https://www.youtube-nocookie.com/embed/abcdefghijk?start=12&autoplay=1',
        );
    });
    it.each(['youtube', 'url'] as const)(
        'replays a %s video directly from its separately revealed transcript',
        (kind) => {
            const play = vi
                .spyOn(HTMLMediaElement.prototype, 'play')
                .mockResolvedValue();
            const onInteraction = vi.fn();
            const { container } = render(
                <LearningBlockView
                    block={{
                        id,
                        type: 'video',
                        source:
                            kind === 'youtube'
                                ? { kind, videoId: 'abcdefghijk' }
                                : {
                                      kind,
                                      url: 'https://media.example/lesson.mp4',
                                  },
                        transcript: {
                            language: 'en',
                            segments: [
                                {
                                    id: first,
                                    text: 'Full transcript passage',
                                    timing: {
                                        startSeconds: 25,
                                        endSeconds: 30,
                                    },
                                },
                            ],
                        },
                    }}
                    labels={labels}
                    onInteraction={onInteraction}
                />,
            );
            expect(
                screen.queryByRole('button', { name: 'Replay' }),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Show transcript' }),
            );
            fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
            if (kind === 'youtube')
                expect(container.querySelector('iframe')).toHaveAttribute(
                    'src',
                    'https://www.youtube-nocookie.com/embed/abcdefghijk?start=25&autoplay=1',
                );
            else {
                expect(container.querySelector('video')!.currentTime).toBe(25);
                expect(play).toHaveBeenCalledTimes(1);
            }
            expect(onInteraction.mock.calls).toEqual([
                [id, { kind: 'transcript-revealed' }],
            ]);
            play.mockRestore();
        },
    );
    it('does not manufacture video replay for unsupported or executable descriptors', () => {
        const { container } = render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                hintTranscript={{
                    language: 'en',
                    segments: [
                        {
                            id: first,
                            text: 'Relevant passage only',
                            timing: { startSeconds: 12, endSeconds: 15 },
                        },
                    ],
                }}
                hintVideoSource={{ kind: 'url', url: 'javascript:alert(1)' }}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        expect(screen.getByText('Relevant passage only')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Replay' }),
        ).not.toBeInTheDocument();
        expect(container.querySelector('video,iframe')).toBeNull();
    });
    it('offers a safe ordinary source link after direct video playback fails', () => {
        const source = 'https://unsupported.example/watch?v=lesson';
        const { container } = render(
            <LearningBlockView
                block={{
                    id,
                    type: 'video',
                    source: { kind: 'url', url: source },
                }}
                labels={labels}
            />,
        );
        expect(
            screen.queryByRole('link', { name: 'Open video source' }),
        ).not.toBeInTheDocument();
        fireEvent.error(container.querySelector('video')!);
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Media unavailable',
        );
        const link = screen.getByRole('link', { name: 'Open video source' });
        expect(link).toHaveAttribute('href', source);
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(container.querySelector('iframe')).toBeNull();
    });
    it.each([
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'https://user:secret@media.example/lesson.mp4',
    ])('rejects unsafe source link fallback %s', (url) => {
        const { container } = render(
            <VideoPlayer
                source={{ kind: 'url', url }}
                title='Video'
                unavailableLabel={labels.mediaUnavailable}
                openSourceLabel={labels.openVideoSource}
            />,
        );
        expect(screen.getByRole('status')).toHaveTextContent(
            'Media unavailable',
        );
        expect(container.querySelector('video,iframe,a')).toBeNull();
    });
    it('reveals only the linked bilingual passage as literal text with no media replay', () => {
        const sourceId = '44444444-4444-4444-8444-444444444444';
        const linked = {
            ...exercise,
            source: { blockId: sourceId, segmentIds: [first] },
        };
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: sourceId,
                                type: 'bilingual-text',
                                language: 'en',
                                segments: [
                                    {
                                        id: first,
                                        text: '<img src=x onerror=alert(1)>Selected original',
                                    },
                                    { id: second, text: 'Unselected original' },
                                ],
                                translations: [],
                            },
                        },
                    },
                ],
            },
        });
        const source = exerciseSource(linked, body);
        const onInteraction = vi.fn();
        const { container } = render(
            <LearningBlockView
                block={linked}
                labels={labels}
                hintTranscript={source.transcript}
                onInteraction={onInteraction}
            />,
        );
        expect(
            screen.queryByText('<img src=x onerror=alert(1)>Selected original'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
        expect(
            screen.getByText('<img src=x onerror=alert(1)>Selected original'),
        ).toBeVisible();
        expect(
            screen.queryByText('Unselected original'),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Replay' }),
        ).not.toBeInTheDocument();
        expect(
            container.querySelector('img,script,iframe,audio,video'),
        ).toBeNull();
        expect(onInteraction.mock.calls).toEqual([[id, { kind: 'hint-used' }]]);
    });
});
