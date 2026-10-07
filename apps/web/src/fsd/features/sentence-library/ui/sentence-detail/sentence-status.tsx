import {
    EyeOffIcon,
    RotateCcwIcon,
    ArchiveIcon,
    ClockIcon,
    CheckCircle2Icon,
} from 'lucide-react';
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
                    className='h-4 w-4 text-success-default'
                />
            ),
        });
    if (sentence.outdated)
        reasons.push({
            text: L('statusOutdatedBody'),
            icon: (
                <ClockIcon
                    aria-hidden
                    className='h-4 w-4 text-warning-default'
                />
            ),
        });
    if (sentence.archivedByMe)
        reasons.push({
            text: L('statusMineBody'),
            icon: <EyeOffIcon aria-hidden className='h-4 w-4' />,
        });
    if (sentence.globallyArchived)
        reasons.push({
            text: L('statusGlobalBody'),
            icon: <ArchiveIcon aria-hidden className='h-4 w-4' />,
        });
    const icon = sentence.archivedByMe ? (
        <RotateCcwIcon aria-hidden className='h-4 w-4' />
    ) : (
        <EyeOffIcon aria-hidden className='h-4 w-4' />
    );
    return (
        <section className='space-y-3 rounded-xl border border-border-default bg-background-subtle p-3'>
            <h3 className='text-sm font-semibold text-text-primary'>
                {L('statusTitle')}
            </h3>
            <ul className='space-y-2 text-sm'>
                {reasons.map((reason) => (
                    <li
                        key={reason.text}
                        className='flex items-start gap-2 text-text-primary'
                    >
                        <span className='mt-0.5 shrink-0'>{reason.icon}</span>
                        <span>{reason.text}</span>
                    </li>
                ))}
            </ul>
            {restoreWarning ? (
                <p className='text-xs text-text-secondary'>
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
