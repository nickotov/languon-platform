import { exerciseSource } from '../src/fsd/features/workbook-learning/lib/exercise-source';
import { KnowledgeBodySchema } from '@languon/contracts';
import { VideoPlayer } from '../src/fsd/entities/learning-blocks/ui/media-block/media-block';
import { checkPreparedAnswer } from '../src/fsd/entities/learning-blocks/lib/check-prepared-answer';
import { safeAudioUrl } from '../src/fsd/entities/learning-blocks/lib/safe-audio-url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import {
    LearningBlockView,
    LearningExerciseSet,
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

it('counts only real local checks and clears anonymous attempts on retry', () => {
    const block = {
        ...exercise,
        format: 'multiple-choice' as const,
        choices: [
            { id: first, text: 'Past' },
            { id: second, text: 'Present' },
        ],
        correctChoiceId: first,
        hint: 'Consider the tense.',
    } as Extract<LearningBlock, { type: 'exercise' }>;
    const entries = [{ block }];
    const setLabels = {
        ...labels,
        check: 'Check',
        expandAll: 'Expand all',
        collapseAll: 'Collapse all',
        attempted: 'attempted',
    };
    const { rerender } = render(
        <LearningExerciseSet entries={entries} labels={setLabels} />,
    );
    expect(screen.getByText('0 / 1 attempted')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    fireEvent.click(screen.getByLabelText('Past'));
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show answer' }));
    expect(screen.getByText('0 / 1 attempted')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByLabelText('Past')).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByText('1 / 1 attempted')).toBeVisible();
    rerender(
        <LearningExerciseSet
            entries={[{ block: { ...block, explanation: 'A correction.' } }]}
            labels={setLabels}
        />,
    );
    expect(screen.getByText('1 / 1 attempted')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('0 / 1 attempted')).toBeVisible();
    fireEvent.click(screen.getByLabelText('Past'));
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    rerender(
        <LearningExerciseSet
            entries={[{ block: { ...block, question: 'A changed question?' } }]}
            labels={setLabels}
        />,
    );
    expect(screen.getByText('0 / 1 attempted')).toBeVisible();
});

it('keeps historical attempts on retry and counts an actual AI check', () => {
    const evaluate = vi.fn();
    render(
        <LearningExerciseSet
            entries={[
                {
                    block: exercise as Extract<
                        LearningBlock,
                        { type: 'exercise' }
                    >,
                    options: {
                        onEvaluate: evaluate,
                        learnerState: {
                            attempted: false,
                            revealed: false,
                            hintUsed: false,
                        },
                    },
                },
            ]}
            labels={{
                ...labels,
                attempted: 'attempted',
                expandAll: 'Expand all',
            }}
        />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'My answer' },
    });
    expect(screen.getByText('0 / 1 attempted')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Check with AI' }));
    expect(evaluate).toHaveBeenCalledWith(id, 'My answer');
    expect(screen.getByText('1 / 1 attempted')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('1 / 1 attempted')).toBeVisible();
});

it('offers an unavailable AI check with the host reason and no attempted event', () => {
    const evaluate = vi.fn();
    const attempt = vi.fn();
    const { rerender } = render(
        <LearningBlockView
            block={exercise}
            labels={labels}
            evaluationUnavailableReason='Save changes first'
            onEvaluate={evaluate}
            onAttemptedChange={attempt}
        />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'My answer' },
    });
    const check = screen.getByRole('button', { name: 'Check with AI' });
    expect(check).toBeDisabled();
    expect(check).toHaveAttribute('title', 'Save changes first');
    fireEvent.click(check);
    expect(evaluate).not.toHaveBeenCalled();
    expect(attempt).not.toHaveBeenCalled();
    rerender(
        <LearningBlockView
            block={exercise}
            labels={labels}
            evaluationUnavailableReason='Sign in to check'
        />,
    );
    expect(
        screen.getByRole('button', { name: 'Check with AI' }),
    ).toBeDisabled();
    expect(
        screen.getByRole('button', { name: 'Check with AI' }),
    ).toHaveAttribute('title', 'Sign in to check');
});

describe('reusable learning blocks', () => {
    it('uses the same case-sensitive NFC/whitespace policy as prepared server checking', () => {
        const block = {
            id,
            type: 'exercise' as const,
            format: 'fill-in-the-blank' as const,
            question: 'Complete',
            referenceAnswer: 'café noir',
            explanation: 'Prepared equivalent',
            parts: [
                {
                    kind: 'gap' as const,
                    id: first,
                    acceptedAnswers: ['café noir'],
                },
            ],
        };
        expect(
            checkPreparedAnswer(block, { [first]: '  cafe\u0301  noir ' }),
        ).toBe(true);
        expect(checkPreparedAnswer(block, { [first]: 'CAFÉ noir' })).toBe(
            false,
        );
    });
    it('does not label an edited answer with persisted correctness or feedback', () => {
        render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                feedback='Correct: saved evaluation'
                learnerState={{
                    answer: 'A saved attempt',
                    attempted: true,
                    correct: true,
                    revealed: false,
                    hintUsed: false,
                }}
            />,
        );
        expect(screen.getByRole('status')).toHaveTextContent(
            'saved evaluation',
        );
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'Another answer' },
        });
        expect(
            screen.queryByText('Correct: saved evaluation'),
        ).not.toBeInTheDocument();
    });
    it('resets local answers on a new material revision even when the task text is unchanged', () => {
        const { rerender } = render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                exerciseRevision='one'
            />,
        );
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'Old material answer' },
        });
        rerender(
            <LearningBlockView
                block={exercise}
                labels={labels}
                exerciseRevision='two'
            />,
        );
        expect(screen.getByRole('textbox')).toHaveValue('');
    });
    it('preserves an expanded unsent draft when private progress and media URLs first load', () => {
        const initial = {
            block: exercise,
            labels,
            variant: 'learner' as const,
            evaluationUnavailableReason: 'Loading progress',
        };
        const { rerender } = render(<LearningBlockView {...initial} />);
        fireEvent.click(
            screen.getByRole('button', { name: exercise.question }),
        );
        const field = screen.getByRole('textbox');
        fireEvent.change(field, { target: { value: 'My early draft' } });
        const hydrated = {
            block: exercise,
            labels,
            variant: 'learner' as const,
            exerciseRevision: 'first-server-revision',
            learnerState: {
                answer: 'Previous saved answer',
                attempted: true,
                revealed: false,
                hintUsed: false,
            },
            onEvaluate: vi.fn(),
        };
        rerender(
            <LearningBlockView
                {...hydrated}
                audioUrl='https://example.com/audio?token=first'
            />,
        );
        expect(screen.getByRole('textbox')).toBe(field);
        expect(field).toHaveValue('My early draft');
        expect(
            screen.getByRole('button', { name: 'Check with AI' }),
        ).toBeEnabled();
        rerender(
            <LearningBlockView
                {...hydrated}
                audioUrl='https://example.com/audio?token=refreshed'
            />,
        );
        expect(screen.getByRole('textbox')).toBe(field);
        expect(field).toHaveValue('My early draft');
        rerender(
            <LearningBlockView
                {...hydrated}
                exerciseRevision='changed-source-revision'
            />,
        );
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', {
                name: new RegExp(exercise.question.replace('?', '\\?')),
            }),
        );
        expect(screen.getByRole('textbox')).not.toBe(field);
        expect(screen.getByRole('textbox')).toHaveValue(
            'Previous saved answer',
        );
    });
    it('expands a question set while retaining individual drafts and private attempted counts', () => {
        render(
            <LearningExerciseSet
                entries={[
                    {
                        block: exercise as Extract<
                            LearningBlock,
                            { type: 'exercise' }
                        >,
                        options: {
                            learnerState: {
                                answer: 'A saved answer',
                                attempted: true,
                                revealed: false,
                                hintUsed: false,
                            },
                        },
                    },
                    {
                        block: {
                            ...exercise,
                            id: first,
                            question: 'What happened next?',
                        } as Extract<LearningBlock, { type: 'exercise' }>,
                    },
                ]}
                labels={{
                    ...labels,
                    expandAll: 'Expand all',
                    collapseAll: 'Collapse all',
                    attempted: 'attempted',
                }}
                title='Practice'
            />,
        );
        expect(screen.getByText('1 / 2 attempted')).toBeVisible();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
        expect(screen.getAllByRole('textbox')).toHaveLength(2);
        fireEvent.change(screen.getAllByRole('textbox')[1]!, {
            target: { value: 'My second answer' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
        expect(screen.getAllByRole('textbox')[0]).toHaveValue('A saved answer');
        expect(screen.getAllByRole('textbox')[1]).toHaveValue(
            'My second answer',
        );
    });
    it('shows compact vocabulary pairs and plays through its host without a practice reveal', () => {
        const onPlay = vi.fn();
        render(
            <LearningBlockView
                block={{
                    id,
                    type: 'vocabulary',
                    language: 'fr',
                    translationLanguage: 'ru',
                    entries: [
                        { id: first, term: 'travail', translation: 'работа' },
                    ],
                }}
                labels={labels}
                variant='compact'
                scope='chat-proposal'
                playback={{ onPlay }}
            />,
        );
        expect(screen.getByText('работа')).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Show answer' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Replay: travail' }),
        );
        expect(onPlay).toHaveBeenCalledWith({
            id: `chat-proposal:${first}`,
            blockId: id,
            text: 'travail',
            language: 'fr',
        });
    });
    it('reviews prepared exercise answers without asking the author to solve them', () => {
        render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                variant='review'
            />,
        );
        expect(screen.getByText('She left.', { exact: false })).toBeVisible();
        expect(
            screen.getByText('The passage describes her departure.'),
        ).toBeVisible();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Show answer' }),
        ).not.toBeInTheDocument();
    });
    it('keeps inline answers while folding and expanding a learner exercise', () => {
        render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                variant='learner'
            />,
        );
        const toggle = screen.getByRole('button', { expanded: false });
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(toggle);
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'She went away.' },
        });
        fireEvent.click(toggle);
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        fireEvent.click(toggle);
        expect(screen.getByRole('textbox')).toHaveValue('She went away.');
        expect(screen.queryByText('She left.')).not.toBeInTheDocument();
    });
    it('hydrates private practice once while preserving edits when saved state refreshes', () => {
        const saved = {
            answer: 'A saved attempt',
            attempted: true,
            revealed: false,
            hintUsed: false,
        };
        const { rerender } = render(
            <LearningBlockView
                block={exercise}
                labels={labels}
                learnerState={saved}
            />,
        );
        expect(screen.getByRole('textbox')).toHaveValue('A saved attempt');
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'A new draft' },
        });
        rerender(
            <LearningBlockView
                block={exercise}
                labels={labels}
                learnerState={{ ...saved, answer: 'A later server refresh' }}
            />,
        );
        expect(screen.getByRole('textbox')).toHaveValue('A new draft');
        rerender(
            <LearningBlockView
                block={{ ...exercise, explanation: 'A corrected explanation' }}
                labels={labels}
                learnerState={saved}
            />,
        );
        expect(screen.getByRole('textbox')).toHaveValue('A new draft');
    });
    it('distinguishes unprepared audio and defers explicit video playback in previews', () => {
        const { rerender, container } = render(
            <LearningBlockView
                block={{ id, type: 'audio' }}
                labels={{ ...labels, noRecording: 'No recording prepared' }}
                variant='author'
            />,
        );
        expect(screen.getByRole('status')).toHaveTextContent(
            'No recording prepared',
        );
        expect(container.querySelector('audio')).toBeNull();
        rerender(
            <LearningBlockView
                block={{
                    id,
                    type: 'video',
                    source: { kind: 'youtube', videoId: 'abcdefghijk' },
                }}
                labels={labels}
                variant='compact'
            />,
        );
        expect(container.querySelector('iframe')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
        expect(container.querySelector('iframe')).toHaveAttribute(
            'src',
            'https://www.youtube-nocookie.com/embed/abcdefghijk',
        );
    });
    it('checks prepared choices without AI or revealing the reference answer', () => {
        render(
            <LearningBlockView
                block={{
                    id,
                    type: 'exercise',
                    format: 'multiple-choice',
                    question: 'Choose',
                    referenceAnswer: 'The first one',
                    explanation: 'It describes a past event.',
                    choices: [
                        { id: first, text: 'Past' },
                        { id: second, text: 'Present' },
                    ],
                    correctChoiceId: first,
                }}
                labels={{ ...labels, check: 'Check' }}
            />,
        );
        fireEvent.click(screen.getByLabelText('Past'));
        fireEvent.click(screen.getByRole('button', { name: 'Check' }));
        expect(screen.getByRole('status')).toHaveTextContent('Correct');
        expect(screen.queryByText('The first one')).not.toBeInTheDocument();
    });
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
            screen.getByText('First source').closest('li'),
        ).toHaveTextContent('Primero');
        expect(
            screen.getByText('Second source').closest('li'),
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
