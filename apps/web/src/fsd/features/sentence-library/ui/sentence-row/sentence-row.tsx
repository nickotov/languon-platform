import {
    EyeIcon,
    EyeOffIcon,
    MoreHorizontalIcon,
    RotateCcwIcon,
} from 'lucide-react';
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
        <RotateCcwIcon aria-hidden className='h-4 w-4' />
    ) : (
        <EyeOffIcon aria-hidden className='h-4 w-4' />
    );
    const rowClass = `flex gap-3 rounded-xl border p-3 transition-colors sm:p-4 ${selected ? 'border-primary-default bg-primary-subtle' : 'border-border-default bg-background-surface'}`;
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
            <div className='pt-0.5'>
                <Checkbox
                    size='md'
                    checked={selected}
                    disabled={locked}
                    onChange={toggle}
                    aria-label={L('rowSelect', { sentence: preview })}
                />
            </div>
            <div className='min-w-0 flex-1'>
                <p
                    lang={sentence.sentenceLanguage}
                    dir='auto'
                    className='break-words text-base leading-relaxed text-text-primary [overflow-wrap:anywhere]'
                >
                    {sentence.sentence}
                </p>
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                    <DirectionBadge
                        from={sentence.sentenceLanguage}
                        to={sentence.answerLanguage}
                    />
                    <StatusBadges sentence={sentence} />
                    <OwnershipMeta sentence={sentence} />
                </div>
            </div>
            <div className='hidden shrink-0 items-start gap-2 md:flex'>
                <Button
                    size='compact'
                    variant='secondary'
                    leadingIcon={<EyeIcon aria-hidden className='h-4 w-4' />}
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
            <div className='shrink-0 md:hidden'>
                <Popover>
                    <PopoverTrigger
                        className='inline-flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-background-surface text-text-primary'
                        aria-label={L('rowActions', { sentence: preview })}
                    >
                        <MoreHorizontalIcon aria-hidden className='h-4 w-4' />
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
