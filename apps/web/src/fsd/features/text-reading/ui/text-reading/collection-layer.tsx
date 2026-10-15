import { BookPlus, Info, X } from 'lucide-react';
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
    portalContainer,
}: {
    c: CollectController;
    portalContainer?: HTMLElement | null;
    requestWithSession?: RequestWithTextSession | undefined;
    compact: boolean;
    onRequireSignIn?: (() => void) | undefined;
}) {
    const t = useReadingCopy();
    const selection = c.selection;
    const panelOpen = !['closed', 'trigger'].includes(c.step);
    const trigger = selection && (
        <div className={styles.trigger}>
            {selection.kind === 'valid' ? (
                <Button
                    size='compact'
                    onMouseDown={(e) => e.preventDefault()}
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => void c.open()}
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
    const title =
        c.step === 'new'
            ? t('texts.collect.new')
            : c.step === 'signin'
              ? t('texts.collect.signin')
              : t('texts.collect.title', { term: selection?.text ?? '' });
    if (['adding', 'success'].includes(c.step)) return null;
    return (
        <>
            {selection &&
                c.step !== 'closed' &&
                (compact ? (
                    panelOpen ? (
                        <BottomSheet
                            open
                            title={title}
                            onClose={c.close}
                            closeLabel={t('texts.collect.close')}
                            dismissible={c.step !== 'adding'}
                        >
                            <CollectPanel
                                requestWithSession={requestWithSession}
                                collect={c}
                                onRequireSignIn={onRequireSignIn}
                            />
                        </BottomSheet>
                    ) : (
                        <div className={styles.mobileTrigger}>{trigger}</div>
                    )
                ) : (
                    <Popover open onOpenChange={(open) => !open && c.close()}>
                        <PopoverAnchor asChild>
                            <span
                                className={styles.selectionAnchor}
                                style={{
                                    top: selection.rect.top,
                                    left: selection.rect.left,
                                    width: selection.rect.width,
                                    height: selection.rect.height,
                                }}
                            />
                        </PopoverAnchor>
                        <PopoverContent
                            portalContainer={portalContainer ?? null}
                            side='top'
                            align='center'
                            sideOffset={10}
                            className={
                                panelOpen
                                    ? styles.popover
                                    : styles.triggerPopover
                            }
                        >
                            {panelOpen ? (
                                <>
                                    <div className={styles.panelHeading}>
                                        <h2>{title}</h2>
                                        <IconButton
                                            icon={<X size={16} />}
                                            label={t('texts.collect.close')}
                                            onClick={c.close}
                                            disabled={c.step === 'adding'}
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
                ))}
        </>
    );
}
