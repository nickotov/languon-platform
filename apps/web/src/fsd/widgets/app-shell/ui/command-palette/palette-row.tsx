import {
    FileText,
    Languages,
    Lightbulb,
    MoreHorizontal,
    Pin,
    PinOff,
    Plus,
    Settings,
    Sun,
} from 'lucide-react';
import { useResourcePin } from '@/fsd/features/library-navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu } from '@/fsd/shared/ui';
import type { PaletteItem } from '../../hooks/use-palette';
import { useShellNavigation } from '../../model/navigation-context';
import { navigationSections } from '../../lib/navigation-sections';
import { resourceMetadata } from '../../lib/navigation-display';
import styles from './command-palette.module.css';

export function PaletteRow({
    item,
    active,
    onRun,
    onActive,
}: {
    item: PaletteItem;
    active: boolean;
    onRun(item: PaletteItem): void;
    onActive(id: string): void;
}) {
    const { t, locale } = useI18n();
    const { requestWithSession } = useShellNavigation();
    const pin = useResourcePin(requestWithSession);
    let Icon = Plus;
    if (item.resource?.kind === 'dictionary') Icon = Languages;
    if (item.resource?.kind === 'text') Icon = FileText;
    if (item.resource?.kind === 'knowledge') Icon = Lightbulb;
    if (item.id === 'settings') Icon = Settings;
    if (item.id === 'theme') Icon = Sun;
    const resource = item.resource;
    const section = navigationSections.find(
        (section) => section.kind === resource?.kind,
    );
    const sectionLabel = section ? t(section.label) : '';
    const meta = resource
        ? resourceMetadata(resource, locale, sectionLabel)
        : undefined;
    const className = active ? `${styles.row} ${styles.active}` : styles.row;
    function activate() {
        onActive(item.id);
    }
    function run() {
        onRun(item);
    }
    function togglePin() {
        if (resource) pin.mutate(resource);
    }
    const menu = [
        {
            label: t(resource?.pinned ? 'shell.unpin' : 'shell.pin'),
            icon: resource?.pinned ? <PinOff size={14} /> : <Pin size={14} />,
            disabled: pin.isPending,
            onSelect: togglePin,
        },
    ];
    return (
        <>
            <li
                aria-description={meta}
                aria-label={item.label}
                aria-selected={active}
                className={className}
                id={`palette-${item.id}`}
                onMouseMove={activate}
                role='row'
            >
                <div
                    aria-colspan={resource ? 1 : 2}
                    className={styles.primaryCell}
                    role='gridcell'
                >
                    <button
                        aria-description={meta}
                        aria-label={item.label}
                        className={styles.option}
                        onClick={run}
                        tabIndex={-1}
                        type='button'
                    >
                        <Icon aria-hidden size={16} strokeWidth={1.75} />
                        <span className={styles.title}>{item.label}</span>
                        {meta ? (
                            <span className={styles.meta}>{meta}</span>
                        ) : null}
                        {resource?.pinned ? <Pin size={12} /> : null}
                    </button>
                </div>
                {resource ? (
                    <div role='gridcell'>
                        <Menu
                            allowDisabledItems
                            iconOnly
                            items={menu}
                            label={`${t('shell.resourceMenu')}: ${item.label}`}
                            trigger={<MoreHorizontal size={16} />}
                            triggerClassName={styles.pinMenu}
                        />
                    </div>
                ) : null}
            </li>
            {pin.isError ? (
                <li role='row'>
                    <div
                        aria-colspan={2}
                        className={styles.message}
                        role='gridcell'
                    >
                        <p role='alert'>
                            {t('shell.pinFailed')}
                            <button onClick={togglePin} type='button'>
                                {t('shell.retry')}
                            </button>
                        </p>
                    </div>
                </li>
            ) : null}
        </>
    );
}
