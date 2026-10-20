'use client';
import {
    Check,
    ChevronDown,
    ChevronsDown,
    ChevronsUp,
    EllipsisVertical,
    Sparkles,
    GraduationCap,
    ExternalLink,
    History,
    Minus,
    PanelLeft,
    PanelRight,
    SquarePen,
    Trash2,
    X,
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
export function TutorMark({ workspace = false }: { workspace?: boolean }) {
    return (
        <span className={styles.mark} aria-hidden>
            {workspace ? <GraduationCap /> : <Sparkles />}
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
    workspace = false,
    embedded = false,
}: {
    layout: ReturnType<typeof useTutorLayout>;
    context: TutorContextProps;
    actions: TutorHeaderActions;
    onFold(): void;
    onPointerDown: PointerEventHandler<HTMLDivElement>;
    workspace?: boolean;
    embedded?: boolean;
}) {
    const { locale } = useI18n();
    const copy = tutorShellCopy(locale);
    const existing = conversationCopy(locale);
    const placement = useCompanionLayout();
    function toggleDetached() {
        if (placement) placement.setDetached(!placement.detached);
    }
    function toggleHalfWidth() {
        if (placement) placement.setHalfWidth(!placement.halfWidth);
    }
    const buttonSize = layout.mobile ? 'large' : 'small';
    const expansionLabel = layout.sheetFull ? copy.partial : copy.expand;
    const expansionIcon = layout.sheetFull ? <ChevronsDown /> : <ChevronsUp />;
    let foldIcon = layout.mobile && !embedded ? <ChevronDown /> : <Minus />;
    if (workspace) foldIcon = <X />;
    const items: MenuItem[] = [
        {
            headingBefore: copy.conversation,
            label: existing.history,
            icon: <History />,
            onSelect: actions.onHistory,
            disabled: Boolean(actions.busy),
        },
    ];
    if (layout.mobile || workspace)
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
    if (placement && layout.attached && !layout.mobile && !workspace)
        items.push({
            separatorBefore: true,
            headingBefore: copy.layout,
            label: copy.halfWidth,
            checked: placement.halfWidth,
            icon: placement.halfWidth ? (
                <Check />
            ) : (
                <span className={styles.emptyCheck} />
            ),
            closeOnSelect: false,
            onSelect: toggleHalfWidth,
        });
    if (placement && !layout.mobile)
        items.push({
            separatorBefore: !layout.attached,
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
        <div
            className={styles.header}
            data-tutor-header
            onPointerDown={onPointerDown}
        >
            {(!layout.mobile || workspace) && (
                <TutorMark workspace={workspace} />
            )}
            <div className={styles.heading}>
                <h2>{copy.title}</h2>
                {!workspace && <TutorContext {...context} />}
            </div>
            <div className={styles.actions}>
                {(!layout.mobile || workspace) && (
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
                {layout.mobile && !embedded && (
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
