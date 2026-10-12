import {
    EyeIcon,
    EyeOffIcon,
    MoreHorizontalIcon,
    RotateCcwIcon,
} from 'lucide-react';
import componentStyles from './sentence-row.module.css';
import type { MouseEvent } from 'react';
import {
    Button,
    Checkbox,
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverItem,
} from '@/fsd/shared/ui';
import { useInterfaceText } from '../../hooks/use-interface-text';
import type { SavedSentence } from '../../types';
import {
    DirectionBadge,
    StatusBadges,
    OwnershipMeta,
} from '../sentence-badges/sentence-badges';
export function SentenceRow({
    sentence,
    selected,
    locked,
    onToggle,
    onView,
    onArchiveToggle,
}: {
    sentence: SavedSentence;
    selected: boolean;
    locked: boolean;
    onToggle(id: string): void;
    onView(id: string, trigger: HTMLElement): void;
    onArchiveToggle(sentence: SavedSentence): void;
}) {
    const { L } = useInterfaceText();
    const preview = sentence.sentence.slice(0, 60);
    const archiveLabel = sentence.archivedByMe ? L('restore') : L('removeMine');
    const archiveIcon = sentence.archivedByMe ? (
        <RotateCcwIcon aria-hidden className={componentStyles.icon} />
    ) : (
        <EyeOffIcon aria-hidden className={componentStyles.icon} />
    );
    const rowClass = [
        componentStyles.row,
        selected ? componentStyles.selected : '',
    ]
        .filter(Boolean)
        .join(' ');
    function toggle() {
        onToggle(sentence.id);
    }
    function view(event: MouseEvent<HTMLButtonElement>) {
        onView(sentence.id, event.currentTarget);
    }
    function archive() {
        onArchiveToggle(sentence);
    }
    return (
        <li className={rowClass} data-sentence-id={sentence.id}>
            <div className={componentStyles.checkbox}>
                <Checkbox
                    size='md'
                    checked={selected}
                    disabled={locked}
                    onChange={toggle}
                    aria-label={L('rowSelect', { sentence: preview })}
                />
            </div>
            <div className={componentStyles.content}>
                <p
                    lang={sentence.sentenceLanguage}
                    dir='auto'
                    className={componentStyles.sentence}
                >
                    {sentence.sentence}
                </p>
                <div className={componentStyles.metadata}>
                    <DirectionBadge
                        from={sentence.sentenceLanguage}
                        to={sentence.answerLanguage}
                    />
                    <StatusBadges sentence={sentence} />
                    <OwnershipMeta sentence={sentence} />
                </div>
            </div>
            <div className={componentStyles.desktopActions}>
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={
                        <EyeIcon aria-hidden className={componentStyles.icon} />
                    }
                    onClick={view}
                >
                    {L('view')}
                </Button>
                <Button
                    size='compact'
                    variant='secondary'
                    disabled={locked}
                    leadingIcon={archiveIcon}
                    onClick={archive}
                    aria-label={`${archiveLabel}: ${preview}`}
                >
                    {sentence.archivedByMe ? L('restore') : L('removeShort')}
                </Button>
            </div>
            <div className={componentStyles.mobileActions}>
                <Popover>
                    <PopoverTrigger
                        className={componentStyles.menuButton}
                        aria-label={L('rowActions', { sentence: preview })}
                    >
                        <MoreHorizontalIcon
                            aria-hidden
                            className={componentStyles.icon}
                        />
                    </PopoverTrigger>
                    <PopoverContent>
                        <PopoverItem onClick={view}>{L('view')}</PopoverItem>
                        <PopoverItem disabled={locked} onClick={archive}>
                            {archiveLabel}
                        </PopoverItem>
                    </PopoverContent>
                </Popover>
            </div>
        </li>
    );
}
