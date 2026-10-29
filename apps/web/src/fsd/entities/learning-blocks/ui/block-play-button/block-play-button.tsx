import { Volume2, Square, AlertCircle } from 'lucide-react';
import { IconButton } from '@/fsd/shared/ui/icon-button/icon-button';
import type {
    LearningBlockLabels,
    LearningBlockPlayback,
    LearningPlaybackRequest,
} from '../../types';
import styles from './block-play-button.module.css';

export function BlockPlayButton({
    request,
    playback,
    labels,
}: {
    request: LearningPlaybackRequest;
    playback?: LearningBlockPlayback | undefined;
    labels: LearningBlockLabels;
}) {
    if (!playback) return null;
    const active = playback.activeId === request.id;
    const playing = active && playback.status === 'playing';
    const pending = active && playback.status === 'preparing';
    const failed = active && playback.status === 'unavailable';
    let icon = <Volume2 size={14} />;
    if (playing) icon = <Square size={14} />;
    if (failed) icon = <AlertCircle size={14} />;
    let label = `${labels.play ?? labels.replay}: ${request.text}`;
    if (playing) label = labels.stop ?? labels.retry;
    if (failed) label = `${labels.retry}: ${request.text}`;
    function handlePlay() {
        if (playing && playback?.onStop) playback.onStop();
        else playback?.onPlay(request);
    }
    return (
        <IconButton
            className={styles.play}
            variant='ghost'
            size='small'
            label={label}
            loading={pending}
            aria-pressed={playing}
            onClick={handlePlay}
            icon={icon}
        />
    );
}
