import { useState, type MouseEvent } from 'react';
import { Headphones } from 'lucide-react';
import {
    type ExerciseLearningBlock,
    type LearningTranscript,
} from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button';
import {
    excerptRanges,
    playAudioExcerpt,
} from '../../../../lib/play-audio-excerpt';
import type { LearningBlockLabels } from '../../../../types';
import { listeningCopy } from '../../../../lib/listening-copy';
import styles from '../../../styles/exercise-block-common.module.css';

export function ListeningReplay({
    block,
    labels,
    transcript,
    checked,
    available,
}: {
    block: ExerciseLearningBlock;
    labels: LearningBlockLabels;
    transcript: LearningTranscript | undefined;
    checked: boolean;
    available: boolean;
}) {
    const [failed, setFailed] = useState(false);
    const ranges = excerptRanges(transcript);
    const meaning = block.semantics?.activity.id === 'L01';
    const [evidence, replay] = listeningCopy(labels.locale);
    if (
        !available ||
        !block.source ||
        !transcript?.segments.length ||
        (meaning && (!checked || !ranges.length))
    ) {
        return null;
    }

    async function listen(event: MouseEvent<HTMLButtonElement>) {
        const container = event.currentTarget.closest(
            '[data-listening-document]',
        );
        // IDs come from validated blocks. Keep editor and adjacent chat previews isolated.
        const source = container?.querySelector(
            `[data-audio-block="${block.source!.blockId}"]`,
        );
        const audio = source?.querySelector('audio');
        const wholeClip =
            source?.getAttribute('data-single-segment') ===
            transcript?.segments[0]?.id;

        if (!audio || (!ranges.length && !wholeClip)) {
            setFailed(true);

            return;
        }

        setFailed(false);
        try {
            await playAudioExcerpt(audio, ranges);
        } catch {
            setFailed(true);
        }
    }

    return (
        <div>
            <Button
                size='compact'
                variant='secondary'
                type='button'
                leadingIcon={<Headphones size={14} aria-hidden />}
                onClick={listen}
            >
                {meaning ? evidence : replay}
            </Button>
            {failed && (
                <p role='status' className={styles.error}>
                    {labels.mediaUnavailable}
                </p>
            )}
        </div>
    );
}
