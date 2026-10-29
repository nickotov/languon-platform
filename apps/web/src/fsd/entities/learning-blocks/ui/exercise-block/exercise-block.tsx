import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { ExerciseLearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import type { LearningAnswer, LearningBlockViewProps } from '../../types';
import { safeAudioUrl } from '../../lib/safe-audio-url';
import {
    Transcript,
    VideoPlayer,
    type VideoSeek,
} from '../media-block/media-block';
import { VideoLearningBlockSchema } from '@languon/contracts';
import styles from '../block-layout.module.css';

export function ExerciseBlock(
    props: LearningBlockViewProps & { block: ExerciseLearningBlock },
) {
    const { block, labels } = props;
    const form = useRef<HTMLFormElement>(null);
    const hintPlayer = useRef<HTMLMediaElement>(null);
    const hintAudioUrl = safeAudioUrl(props.audioUrl);
    const hintVideoResult = VideoLearningBlockSchema.shape.source.safeParse(
        props.hintVideoSource,
    );
    const hintVideo = hintVideoResult.success
        ? hintVideoResult.data
        : undefined;
    const [videoSeek, setVideoSeek] = useState<VideoSeek>();
    const [hintMediaFailed, setHintMediaFailed] = useState(false);
    function handleHintMediaFailure() {
        setHintMediaFailed(true);
    }
    function handleReplayHint(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        if (hintVideo?.kind === 'youtube') {
            setVideoSeek((prior) => ({
                seconds,
                revision: (prior?.revision ?? 0) + 1,
            }));
            return;
        }
        if (!hintPlayer.current) return;
        hintPlayer.current.currentTime = seconds;
        void hintPlayer.current.play().catch(handleHintMediaFailure);
    }
    const replayHint = hintAudioUrl || hintVideo ? handleReplayHint : undefined;
    function handleHintPlayer(element: HTMLMediaElement | null) {
        hintPlayer.current = element;
    }
    const [answer, setAnswer] = useState('');
    const [gaps, setGaps] = useState<Record<string, string>>({});
    const [revealed, setRevealed] = useState(false);
    const [hintVisible, setHintVisible] = useState(false);
    const response: LearningAnswer =
        block.format === 'fill-in-the-blank' ? gaps : answer;
    function handleAnswer(
        event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) {
        setAnswer(event.target.value);
    }
    function handleGap(event: ChangeEvent<HTMLInputElement>) {
        setGaps({ ...gaps, [event.target.name]: event.target.value });
    }
    function handleReveal() {
        if (props.interactionsDisabled) return;
        props.onInteraction?.(block.id, { kind: 'answer-revealed' });
        setRevealed(true);
    }
    function handleHint() {
        if (props.interactionsDisabled) return;
        if (!hintVisible)
            props.onInteraction?.(block.id, { kind: 'hint-used' });
        setHintVisible(!hintVisible);
    }
    function handleRetry() {
        if (props.interactionsDisabled) return;
        setAnswer('');
        setGaps({});
        setRevealed(false);
        setHintVisible(false);
        props.onInteraction?.(block.id, { kind: 'retry' });
    }
    function handleSubmitAttempt(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        props.onSubmitAttempt?.(block.id, response);
    }
    function handleEvaluate() {
        if (!form.current?.reportValidity()) return;
        props.onEvaluate?.(block.id, response);
    }
    const canSubmitAttempt = props.onSubmitAttempt !== undefined;
    const submitAttemptLabel = props.submitAttemptLabel ?? labels.answer;
    const canEvaluate = props.onEvaluate !== undefined;
    const hasHint = props.hintTranscript !== undefined;
    const groupName = `exercise-${block.id}`;
    let fields;
    if (block.format === 'multiple-choice')
        fields = (
            <fieldset className={styles.choices}>
                <legend>{labels.answer}</legend>
                {block.choices.map((choice) => (
                    <label className={styles.choice} key={choice.id}>
                        <input
                            type='radio'
                            name={groupName}
                            value={choice.id}
                            checked={answer === choice.id}
                            onChange={handleAnswer}
                            required
                        />
                        <span dir='auto'>{choice.text}</span>
                    </label>
                ))}
            </fieldset>
        );
    if (block.format === 'free-text')
        fields = (
            <label className={styles.stack}>
                {labels.answer}
                <textarea
                    className={styles.field}
                    value={answer}
                    onChange={handleAnswer}
                    rows={3}
                    maxLength={8000}
                    required
                />
            </label>
        );
    if (block.format === 'fill-in-the-blank')
        fields = (
            <div className={styles.stack}>
                {block.parts.map((part, index) => {
                    if (part.kind === 'text')
                        return (
                            <span dir='auto' key={index}>
                                {part.text}
                            </span>
                        );
                    const gapLabel = `${labels.answer} ${index + 1}`;
                    const gapValue = gaps[part.id] ?? '';
                    return (
                        <label className={styles.stack} key={part.id}>
                            {gapLabel}
                            <input
                                className={styles.field}
                                name={part.id}
                                value={gapValue}
                                onChange={handleGap}
                                maxLength={500}
                                required
                            />
                        </label>
                    );
                })}
            </div>
        );
    return (
        <form
            ref={form}
            className={styles.stack}
            onSubmit={handleSubmitAttempt}
        >
            <p className={styles.text} dir='auto'>
                {block.question}
            </p>
            {fields}
            <div className={styles.actions}>
                {canSubmitAttempt ? (
                    <Button
                        type='submit'
                        loading={props.attemptPending ?? false}
                    >
                        {submitAttemptLabel}
                    </Button>
                ) : null}
                {canEvaluate ? (
                    <Button
                        type='button'
                        onClick={handleEvaluate}
                        loading={props.evaluationPending ?? false}
                    >
                        {labels.checkWithAi}
                    </Button>
                ) : null}
                <Button
                    type='button'
                    variant='secondary'
                    onClick={handleReveal}
                    disabled={revealed || props.interactionsDisabled}
                >
                    {labels.showAnswer}
                </Button>
                {hasHint ? (
                    <Button
                        type='button'
                        variant='ghost'
                        onClick={handleHint}
                        aria-expanded={hintVisible}
                        disabled={props.interactionsDisabled}
                    >
                        {labels.hint}
                    </Button>
                ) : null}
                <Button
                    type='button'
                    variant='ghost'
                    onClick={handleRetry}
                    disabled={props.interactionsDisabled}
                >
                    {labels.retry}
                </Button>
            </div>
            {hintVisible && props.hintTranscript ? (
                <div className={styles.stack}>
                    {hintAudioUrl ? (
                        <audio
                            ref={handleHintPlayer}
                            controls
                            preload='none'
                            src={hintAudioUrl}
                            aria-label={labels.hint}
                            onError={handleHintMediaFailure}
                        />
                    ) : null}
                    {hintVideo ? (
                        <VideoPlayer
                            source={hintVideo}
                            title={`${labels.hint}: ${labels.kinds.video}`}
                            seek={videoSeek}
                            mediaRef={handleHintPlayer}
                            onError={handleHintMediaFailure}
                            unavailableLabel={labels.mediaUnavailable}
                            openSourceLabel={labels.openVideoSource}
                        />
                    ) : null}
                    {hintMediaFailed ? (
                        <p role='alert' className={styles.error}>
                            {labels.mediaUnavailable}
                        </p>
                    ) : null}
                    <Transcript
                        transcript={props.hintTranscript}
                        replayLabel={labels.replay}
                        onReplay={replayHint}
                    />
                </div>
            ) : null}
            {revealed ? (
                <div className={styles.panel} role='status'>
                    <p className={styles.text} dir='auto'>
                        {block.referenceAnswer}
                    </p>
                    <p className={styles.secondary} dir='auto'>
                        {block.explanation}
                    </p>
                </div>
            ) : null}
            {props.feedback ? (
                <p role='status' className={styles.text} dir='auto'>
                    {props.feedback}
                </p>
            ) : null}
            {props.error ? (
                <p role='alert' className={styles.error}>
                    {props.error}
                </p>
            ) : null}
        </form>
    );
}
