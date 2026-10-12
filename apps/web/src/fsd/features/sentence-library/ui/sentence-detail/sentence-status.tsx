import {
    EyeOffIcon,
    RotateCcwIcon,
    ArchiveIcon,
    ClockIcon,
    CheckCircle2Icon,
} from 'lucide-react';
import componentStyles from './sentence-status.module.css';
import type { ReactNode } from 'react';
import { Button } from '@/fsd/shared/ui';
import type { SavedSentence } from '../../types';
import { useInterfaceText } from '../../hooks/use-interface-text';
export function SentenceStatus({
    sentence,
    locked,
    onArchive,
}: {
    sentence: SavedSentence;
    locked: boolean;
    onArchive(): void;
}) {
    const { L } = useInterfaceText();
    const usable =
        !sentence.outdated &&
        !sentence.archivedByMe &&
        !sentence.globallyArchived;
    const restoreWarning =
        sentence.archivedByMe &&
        (sentence.outdated || sentence.globallyArchived);
    const reasons: { text: string; icon: ReactNode }[] = [];
    if (usable)
        reasons.push({
            text: L('statusCurrent'),
            icon: (
                <CheckCircle2Icon
                    aria-hidden
                    className={componentStyles.successIcon}
                />
            ),
        });
    if (sentence.outdated)
        reasons.push({
            text: L('statusOutdatedBody'),
            icon: (
                <ClockIcon
                    aria-hidden
                    className={componentStyles.warningIcon}
                />
            ),
        });
    if (sentence.archivedByMe)
        reasons.push({
            text: L('statusMineBody'),
            icon: <EyeOffIcon aria-hidden className={componentStyles.icon} />,
        });
    if (sentence.globallyArchived)
        reasons.push({
            text: L('statusGlobalBody'),
            icon: <ArchiveIcon aria-hidden className={componentStyles.icon} />,
        });
    const icon = sentence.archivedByMe ? (
        <RotateCcwIcon aria-hidden className={componentStyles.icon} />
    ) : (
        <EyeOffIcon aria-hidden className={componentStyles.icon} />
    );
    return (
        <section className={componentStyles.root}>
            <h3 className={componentStyles.heading}>{L('statusTitle')}</h3>
            <ul className={componentStyles.reasons}>
                {reasons.map((reason) => (
                    <li key={reason.text} className={componentStyles.reason}>
                        <span className={componentStyles.reasonIcon}>
                            {reason.icon}
                        </span>
                        <span>{reason.text}</span>
                    </li>
                ))}
            </ul>
            {restoreWarning ? (
                <p className={componentStyles.help}>
                    {L('restoreOnlyPersonal')}
                </p>
            ) : null}
            <Button
                size='compact'
                variant='secondary'
                disabled={locked}
                leadingIcon={icon}
                onClick={onArchive}
            >
                {L(sentence.archivedByMe ? 'restore' : 'removeMine')}
            </Button>
        </section>
    );
}
