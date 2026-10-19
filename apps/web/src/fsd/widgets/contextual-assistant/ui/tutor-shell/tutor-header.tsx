'use client';
import {
    Check,
    ChevronDown,
    ChevronsDown,
    ChevronsUp,
    EllipsisVertical,
    Sparkles,
    ExternalLink,
    History,
    Minus,
    PanelLeft,
    PanelRight,
    SquarePen,
    Trash2,
} from 'lucide-react';
import type { PointerEventHandler } from 'react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import {
    IconButton,
    Menu,
    useCompanionLayout,
    type MenuItem,
} from '@/fsd/shared/ui';
import type { useTutorLayout } from '../../hooks/use-tutor-layout';
import { TutorContext, type TutorContextProps } from './tutor-context';
import { tutorShellCopy } from './shell-copy';
import styles from './tutor-shell.module.css';
export function TutorMark() {
    return (
        <span className={styles.mark} aria-hidden>
            <Sparkles />
        </span>
    );
}
export type TutorHeaderActions = {
    onNew(): void;
    onHistory(): void;
    onDelete(): void;
    busy?: boolean | undefined;
    canDelete?: boolean | undefined;
};
export function TutorHeader({
    layout,
    context,
    actions,
    onFold,
    onPointerDown,
}: {
    layout: ReturnType<typeof useTutorLayout>;
    context: TutorContextProps;
    actions: TutorHeaderActions;
    onFold(): void;
    onPointerDown: PointerEventHandler<HTMLDivElement>;
}) {
    const { locale } = useI18n();
    const copy = tutorShellCopy(locale);
    const existing = conversationCopy(locale);
    const placement = useCompanionLayout();
    function toggleDetached() {
        if (placement) placement.setDetached(!placement.detached);
    }
    const buttonSize = layout.mobile ? 'large' : 'small';
    const expansionLabel = layout.sheetFull ? copy.partial : copy.expand;
    const expansionIcon = layout.sheetFull ? <ChevronsDown /> : <ChevronsUp />;
    const foldIcon = layout.mobile ? <ChevronDown /> : <Minus />;
    const items: MenuItem[] = [
        {
            headingBefore: copy.conversation,
            label: existing.history,
            icon: <History />,
            onSelect: actions.onHistory,
            disabled: Boolean(actions.busy),
        },
    ];
    if (layout.mobile)
        items.push({
            label: existing.newChat,
            icon: <SquarePen />,
            onSelect: actions.onNew,
            disabled: Boolean(actions.busy),
        });
    else if (!layout.attached)
        items.push(
            {
                separatorBefore: true,
                headingBefore: copy.layout,
                label: layout.dock === 'right' ? copy.left : copy.right,
                icon: layout.dock === 'right' ? <PanelLeft /> : <PanelRight />,
                onSelect: layout.switchDock,
            },
            {
                label: copy.wide,
                checked: layout.wide,
                hint: layout.canWiden ? '' : copy.needsSpace,
                icon: layout.wide ? (
                    <Check />
                ) : (
                    <span className={styles.emptyCheck} />
                ),
                closeOnSelect: false,
                onSelect: layout.toggleWide,
                disabled: !layout.canWiden,
            },
            {
                label: copy.full,
                checked: layout.full,
                icon: layout.full ? (
                    <Check />
                ) : (
                    <span className={styles.emptyCheck} />
                ),
                closeOnSelect: false,
                onSelect: layout.toggleFull,
            },
        );
    if (placement && !layout.mobile)
        items.push({
            separatorBefore: true,
            ...(layout.attached ? { headingBefore: copy.layout } : {}),
            label: copy.detached,
            checked: placement.detached,
            icon: <ExternalLink />,
            onSelect: toggleDetached,
        });
    items.push({
        separatorBefore: true,
        label: existing.deleteChat,
        icon: <Trash2 />,
        tone: 'danger',
        disabled: !actions.canDelete,
        onSelect: actions.onDelete,
    });
    return (
        <div className={styles.header} onPointerDown={onPointerDown}>
            {!layout.mobile && <TutorMark />}
            <div className={styles.heading}>
                <h2>{copy.title}</h2>
                <TutorContext {...context} />
            </div>
            <div className={styles.actions}>
                {!layout.mobile && (
                    <IconButton
                        variant='ghost'
                        size={buttonSize}
                        icon={<SquarePen />}
                        label={existing.newChat}
                        onClick={actions.onNew}
                        disabled={actions.busy}
                        tooltipPlacement='bottom'
                    />
                )}
                <Menu
                    label={copy.more}
                    trigger={<EllipsisVertical />}
                    items={items}
                    showChevron={false}
                    triggerClassName={styles.menuTrigger}
                    menuClassName={styles.menu}
                />
                {layout.mobile && (
                    <IconButton
                        variant='ghost'
                        size={buttonSize}
                        icon={expansionIcon}
                        label={expansionLabel}
                        onClick={layout.toggleSheet}
                        showTooltip={false}
                    />
                )}
                <IconButton
                    variant='ghost'
                    size={buttonSize}
                    icon={foldIcon}
                    label={copy.minimize}
                    onClick={onFold}
                    tooltipPlacement='bottom'
                    showTooltip={!layout.mobile}
                />
            </div>
        </div>
    );
}
