import type { LearningTranscript } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button';
import styles from './transcript.module.css';

export function Transcript({
    transcript,
    replayLabel,
    onReplay,
    position,
    distinguishReplayTimes = false,
}: {
    transcript: LearningTranscript;
    replayLabel: string;
    onReplay?: ((seconds: number, endSeconds?: number) => void) | undefined;
    position?: number | undefined;
    distinguishReplayTimes?: boolean;
}) {
    return (
        <ol className={styles.root} lang={transcript.language} dir='auto'>
            {transcript.segments.map((segment) => {
                const active =
                    position !== undefined &&
                    segment.timing !== undefined &&
                    position >= segment.timing.startSeconds &&
                    position < segment.timing.endSeconds;

                return (
                    <TranscriptSegment
                        key={segment.id}
                        segment={segment}
                        replayLabel={replayLabel}
                        onReplay={onReplay}
                        distinguishReplayTimes={
                            distinguishReplayTimes &&
                            transcript.segments.length > 1
                        }
                        active={active}
                    />
                );
            })}
        </ol>
    );
}

function TranscriptSegment({
    segment,
    replayLabel,
    onReplay,
    active,
    distinguishReplayTimes,
}: {
    segment: LearningTranscript['segments'][number];
    replayLabel: string;
    onReplay?: ((seconds: number, endSeconds?: number) => void) | undefined;
    active: boolean;
    distinguishReplayTimes: boolean;
}) {
    function handleReplay() {
        if (segment.timing) {
            onReplay?.(segment.timing.startSeconds, segment.timing.endSeconds);
        }
    }

    const canReplay = segment.timing !== undefined && onReplay !== undefined;
    const seconds = segment.timing?.startSeconds;
    const timestamp =
        seconds === undefined
            ? undefined
            : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    let timing;
    if (timestamp) {
        timing = <span className={styles.time}>{timestamp}</span>;
        if (canReplay) {
            timing = (
                <Button
                    className={styles.timestamp}
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={handleReplay}
                    aria-label={
                        segment.speaker
                            ? `${replayLabel} · ${segment.speaker} · ${timestamp}`
                            : distinguishReplayTimes
                              ? `${replayLabel} · ${timestamp}`
                              : replayLabel
                    }
                >
                    {timestamp}
                </Button>
            );
        }
    }

    return (
        <li className={styles.segment} aria-current={active || undefined}>
            {timing}
            <div>
                {segment.speaker && (
                    <span className={styles.speaker}>{segment.speaker}</span>
                )}
                <p className={styles.text}>{segment.text}</p>
            </div>
        </li>
    );
}
