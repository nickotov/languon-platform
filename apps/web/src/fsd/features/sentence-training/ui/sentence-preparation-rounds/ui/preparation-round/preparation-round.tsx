import {
    CheckCircle2Icon,
    CircleDashedIcon,
    Clock3Icon,
    PlayIcon,
} from 'lucide-react';
import { Badge, Button } from '@/fsd/shared/ui';
import type { SentencePreparationBatch } from '@languon/contracts';
import { usePreparationCopy } from '../../../sentence-preparation-copy';
import styles from '../../../styles/sentence-preparation-rounds-common.module.css';

export function PreparationRound({
    round,
    index,
    startDisabled,
    onStartRound,
}: {
    round: SentencePreparationBatch;
    index: number;
    startDisabled: boolean;
    onStartRound(batch: SentencePreparationBatch): void;
}) {
    const { P } = usePreparationCopy();
    const done = round.preparedEntryIds.length;
    const total = round.entryIds.length;
    const usable = done > 0 && !startDisabled;
    const reasonId = `round-${round.id}-reason`;
    let label = P('statePending');
    let Icon = Clock3Icon;
    let tone: 'neutral' | 'success' | 'info' = 'neutral';
    if (round.state === 'ready') {
        label = P('stateReady');
        Icon = CheckCircle2Icon;
        tone = 'success';
    } else if (round.state === 'partial') {
        label = P('statePartial');
        Icon = CircleDashedIcon;
        tone = 'info';
    }

    const icon = <Icon aria-hidden className={styles.icon} />;

    function start() {
        onStartRound(round);
    }

    let hint = P('startReadyFull');
    if (done === 0) {
        hint = P('startDisabled');
    } else if (done < total) {
        hint = P('startReadyPartial', { done, total });
    }

    return (
        <li key={round.id} className={styles.round}>
            <div className={styles.roundMetadata}>
                <span className={styles.title}>
                    {P('roundN', { i: index + 1 })}
                </span>
                <span className={styles.roundTitle}>
                    {P('roundWords', { n: total })}
                </span>
                <span className={styles.roundTitle}>
                    {P('roundCoverage', { done, total })}
                </span>
                <Badge size='sm' tone={tone} icon={icon}>
                    {label}
                </Badge>
            </div>
            <div className={styles.roundActions}>
                <Button
                    size='compact'
                    variant={index === 0 ? 'primary' : 'secondary'}
                    leadingIcon={
                        <PlayIcon aria-hidden className={styles.icon2} />
                    }
                    disabled={!usable}
                    aria-describedby={reasonId}
                    onClick={start}
                >
                    {P('startReady')}
                </Button>
                <p id={reasonId} className={styles.roundHint}>
                    {hint}
                </p>
            </div>
        </li>
    );
}
