import { ArchiveIcon, ClockIcon, EyeOffIcon } from 'lucide-react';
import { Badge } from '@/fsd/shared/ui';
import { useInterfaceText } from '../../../hooks/use-interface-text';
import type { SavedSentence } from '../../../types';

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
