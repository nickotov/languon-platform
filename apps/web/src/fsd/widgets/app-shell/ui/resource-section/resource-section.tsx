import { ChevronRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import type { AppShellState } from '../../hooks/use-app-shell-state';
import { isRouteWithin } from '../../lib/is-route-within';
import type { NavigationSection } from '../../lib/navigation-sections';
import { useShellNavigation } from '../../model/navigation-context';
import { ResourceList } from '../resource-list/resource-list';
import styles from './resource-section.module.css';

export function ResourceSection({
    section,
    shell,
    touch,
    onNavigate,
}: {
    section: NavigationSection;
    shell: AppShellState;
    touch: boolean;
    onNavigate?: (() => void) | undefined;
}) {
    const { href, t } = useI18n();
    const pathname = usePathname();
    const { create } = useShellNavigation();
    const id = useId();
    const Icon = section.icon;
    const expanded = shell.preferences.sections[section.kind] ?? true;
    const active = isRouteWithin(pathname, section.path);
    const rowClass = [
        styles.row,
        touch ? styles.touch : '',
        active ? styles.active : '',
    ]
        .filter(Boolean)
        .join(' ');
    const disclosureLabel = `${t(expanded ? 'shell.hideRecent' : 'shell.showRecent')}: ${t(section.label)}`;
    function toggle() {
        shell.toggleSection(section.kind);
    }
    function createResource() {
        onNavigate?.();
        create(section.kind);
    }
    return (
        <li>
            <div className={rowClass}>
                <Link
                    aria-current={active ? 'page' : undefined}
                    className={styles.link}
                    href={href(section.path)}
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                >
                    <Icon aria-hidden size={18} strokeWidth={1.75} />
                    <span>{t(section.label)}</span>
                </Link>
                <button
                    aria-label={t(section.createLabel)}
                    className={styles.create}
                    onClick={createResource}
                    title={t(section.createLabel)}
                    type='button'
                >
                    <Plus aria-hidden size={16} />
                </button>
                <button
                    aria-controls={id}
                    aria-expanded={expanded}
                    aria-label={disclosureLabel}
                    className={styles.disclosure}
                    onClick={toggle}
                    type='button'
                >
                    <ChevronRight
                        aria-hidden
                        className={expanded ? styles.openChevron : undefined}
                        size={16}
                    />
                </button>
            </div>
            {expanded ? (
                <div id={id}>
                    <ResourceList
                        onNavigate={onNavigate}
                        section={section}
                        touch={touch}
                    />
                </div>
            ) : null}
        </li>
    );
}
