import React from 'react';
import componentStyles from './sentence-badges.module.css';
import {
    ArchiveIcon,
    ArrowRightIcon,
    ClockIcon,
    EyeOffIcon,
    UserIcon,
    UsersIcon,
} from 'lucide-react';
import { Badge } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import type { SavedSentence } from '../../types';
type LanguageCode = string;

/** Explicit direction: short codes visually, the full language pair for assistive tech. */
export function DirectionBadge({
    from,
    to,
}: {
    from: LanguageCode;
    to: LanguageCode;
}) {
    const { direction } = useInterfaceText();
    const label = direction(from, to);
    return (
        <Badge
            size='sm'
            tone='info'
            title={label}
            aria-label={label}
            className={componentStyles.statusBadge}
        >
            <span aria-hidden className={componentStyles.direction}>
                {from}
                <ArrowRightIcon className={componentStyles.arrow} />
                {to}
            </span>
        </Badge>
    );
}

/** Independent status reasons — each with icon + text, never colour alone. */
export function StatusBadges({ sentence }: { sentence: SavedSentence }) {
    const { L } = useInterfaceText();
    return (
        <>
            {sentence.outdated ? (
                <Badge
                    size='sm'
                    tone='warning'
                    icon={<ClockIcon aria-hidden />}
                >
                    {L('badgeOutdated')}
                </Badge>
            ) : null}
            {sentence.archivedByMe ? (
                <Badge
                    size='sm'
                    tone='neutral'
                    icon={<EyeOffIcon aria-hidden />}
                >
                    {L('badgeArchivedMine')}
                </Badge>
            ) : null}
            {sentence.globallyArchived ? (
                <Badge
                    size='sm'
                    tone='neutral'
                    icon={<ArchiveIcon aria-hidden />}
                >
                    {L('badgeGlobal')}
                </Badge>
            ) : null}
        </>
    );
}

export function OwnershipMeta({ sentence }: { sentence: SavedSentence }) {
    const { L, date } = useInterfaceText();
    const Icon = sentence.ownership === 'mine' ? UserIcon : UsersIcon;
    return (
        <span className={componentStyles.ownership}>
            <span>{L('savedOn', { date: date(sentence.createdAt) })}</span>
            <span aria-hidden>·</span>
            <span className={componentStyles.dictionaryLink}>
                <Icon aria-hidden className={componentStyles.icon} />
                {sentence.ownership === 'mine'
                    ? L('markerMine')
                    : L('markerShared')}
            </span>
        </span>
    );
}
