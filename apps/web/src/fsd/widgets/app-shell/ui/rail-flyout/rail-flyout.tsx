import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent,
    type FocusEvent,
} from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Popover, PopoverAnchor, PopoverContent } from '@/fsd/shared/ui';
import { useHoverIntent } from '../../hooks/use-hover-intent';
import { isRouteWithin } from '../../lib/is-route-within';
import type { NavigationSection } from '../../lib/navigation-sections';
import { useShellNavigation } from '../../model/navigation-context';
import { ResourceList } from '../resource-list/resource-list';
import styles from './rail-flyout.module.css';

export function RailFlyout({ section }: { section: NavigationSection }) {
    const { href, t } = useI18n();
    const { create } = useShellNavigation();
    const pathname = usePathname();
    const intent = useHoverIntent();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const filterRef = useRef<HTMLInputElement>(null);
    const [filter, setFilter] = useState('');
    const Icon = section.icon;
    const active = isRouteWithin(pathname, section.path);
    const buttonClass = active
        ? `${styles.button} ${styles.active}`
        : styles.button;
    function toggle() {
        intent.setOpen(!intent.open || !intent.pinned);
    }
    function focusFilter(event: FocusEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget && intent.pinned)
            filterRef.current?.focus();
    }
    function pinPanel() {
        intent.setOpen(true);
    }
    function close() {
        intent.setOpen(false);
    }
    function createResource() {
        close();
        create(section.kind);
    }
    function changeFilter(event: ChangeEvent<HTMLInputElement>) {
        setFilter(event.target.value);
    }
    function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            intent.setOpen(true);
        }
    }
    useEffect(() => {
        if (intent.open && intent.pinned) filterRef.current?.focus();
        if (!intent.open) setFilter('');
    }, [intent.open, intent.pinned]);
    return (
        <li className={styles.item}>
            <Popover open={intent.open} onOpenChange={intent.setOpen}>
                <PopoverAnchor asChild>
                    <button
                        aria-current={active ? 'page' : undefined}
                        aria-expanded={intent.open}
                        aria-haspopup='dialog'
                        aria-label={t(section.label)}
                        className={buttonClass}
                        onClick={toggle}
                        onKeyDown={keyDown}
                        onPointerEnter={intent.onPointerEnter}
                        onPointerLeave={intent.onPointerLeave}
                        ref={buttonRef}
                        title={t(section.label)}
                        type='button'
                    >
                        <Icon aria-hidden size={20} strokeWidth={1.75} />
                    </button>
                </PopoverAnchor>
                <PopoverContent
                    align='start'
                    aria-label={t(section.label)}
                    autoFocus={intent.pinned}
                    onFocus={focusFilter}
                    onPointerDown={pinPanel}
                    className={styles.panel}
                    closeOnFocusOut={intent.pinned}
                    onPointerEnter={intent.onPointerEnter}
                    onPointerLeave={intent.onPointerLeave}
                    side='right'
                    sideOffset={14}
                >
                    <div className={styles.header}>
                        <span className={styles.icon}>
                            <Icon aria-hidden size={16} strokeWidth={1.75} />
                        </span>
                        <Link
                            className={styles.heading}
                            href={href(section.path)}
                            onClick={close}
                        >
                            {t(section.label)}
                        </Link>
                        <button
                            className={styles.create}
                            onClick={createResource}
                            type='button'
                        >
                            <Plus size={14} />
                            {t('shell.createAction')}
                        </button>
                    </div>
                    <label className={styles.filter}>
                        <Search aria-hidden size={16} />
                        <input
                            aria-label={t('shell.filter')}
                            maxLength={200}
                            onChange={changeFilter}
                            placeholder={t('shell.filter')}
                            ref={filterRef}
                            value={filter}
                        />
                    </label>
                    <div className={styles.list}>
                        <ResourceList
                            filter={filter}
                            onNavigate={close}
                            panel
                            section={section}
                        />
                    </div>
                </PopoverContent>
            </Popover>
        </li>
    );
}
