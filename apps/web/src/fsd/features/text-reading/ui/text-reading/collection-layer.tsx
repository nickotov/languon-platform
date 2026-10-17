import { BookPlus, Info, X } from 'lucide-react';
import type { PointerEvent, MouseEvent } from 'react';
import {
    BottomSheet,
    Button,
    IconButton,
    Popover,
    PopoverAnchor,
    PopoverContent,
} from '@/fsd/shared/ui';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import type { CollectController } from '../../hooks/use-collect';
import { useReadingCopy } from '../../hooks/use-reading-copy';
import { CollectPanel } from '../collect-panel/collect-panel';
import styles from './text-reading.module.css';
import { CollectionNotifications } from './collection-notifications';
export function CollectionLayer(
    props: Parameters<typeof CurrentCollectionLayer>[0],
) {
    return (
        <>
            <CollectionNotifications c={props.c} />
            <CurrentCollectionLayer {...props} />
        </>
    );
}
function CurrentCollectionLayer({
    c,
    compact,
    onRequireSignIn,
    requestWithSession,
}: {
    c: CollectController;
    requestWithSession?: RequestWithTextSession | undefined;
    compact: boolean;
    onRequireSignIn?: (() => void) | undefined;
}) {
    const t = useReadingCopy();
    const selection = c.selection;
    const panelOpen = !['closed', 'trigger'].includes(c.step);

    function preserveSelection(event: PointerEvent | MouseEvent) {
        event.preventDefault();
    }

    function openCollection() {
        void c.open();
    }

    function changeOpen(open: boolean) {
        if (!open) c.close();
    }

    const trigger = selection && (
        <div className={styles.trigger}>
            {selection.kind === 'valid' ? (
                <Button
                    desktopIconOnly
                    size='compact'
                    onMouseDown={preserveSelection}
                    onPointerDown={preserveSelection}
                    onClick={openCollection}
                    leadingIcon={<BookPlus size={16} />}
                >
                    {t('texts.collect.add')}
                </Button>
            ) : (
                <p role='status'>
                    <Info size={16} aria-hidden />
                    {t(
                        selection.kind === 'cross'
                            ? 'texts.collect.cross'
                            : 'texts.collect.long',
                        { count: Array.from(selection.text).length },
                    )}
                </p>
            )}
            <IconButton
                icon={<X size={16} />}
                label={t('texts.collect.close')}
                onClick={c.close}
                variant='ghost'
                size='sm'
            />
        </div>
    );
    let title = t('texts.collect.title', { term: selection?.text ?? '' });

    if (c.step === 'new') title = t('texts.collect.new');
    if (c.step === 'signin') title = t('texts.collect.signin');
    if (['closed', 'adding', 'success'].includes(c.step) || !selection) {
        return null;
    }

    if (compact && panelOpen) {
        return (
            <BottomSheet
                open
                title={title}
                onClose={c.close}
                closeLabel={t('texts.collect.close')}
            >
                <CollectPanel
                    requestWithSession={requestWithSession}
                    collect={c}
                    onRequireSignIn={onRequireSignIn}
                />
            </BottomSheet>
        );
    }

    const contentClass = panelOpen
        ? styles.popover
        : `${styles.popover} ${styles.triggerPopover}`;

    return (
        <Popover open onOpenChange={changeOpen}>
            <PopoverAnchor asChild virtualRef={selection.anchor}>
                <span className={styles.selectionAnchor} aria-hidden='true' />
            </PopoverAnchor>
            <PopoverContent
                aria-label={title}
                side={panelOpen ? 'right' : 'top'}
                align='center'
                sideOffset={10}
                autoFocus={panelOpen}
                returnFocus={panelOpen}
                closeOnFocusOut={false}
                className={contentClass}
            >
                {panelOpen ? (
                    <>
                        <div className={styles.panelHeading}>
                            <h2>{title}</h2>
                            <IconButton
                                icon={<X size={16} />}
                                label={t('texts.collect.close')}
                                onClick={c.close}
                                variant='ghost'
                                size='sm'
                            />
                        </div>
                        <CollectPanel
                            requestWithSession={requestWithSession}
                            collect={c}
                            onRequireSignIn={onRequireSignIn}
                        />
                    </>
                ) : (
                    trigger
                )}
            </PopoverContent>
        </Popover>
    );
}
