import { ArrowRight, Plus, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useNavigationResources } from '@/fsd/features/library-navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { Skeleton } from '@/fsd/shared/ui';
import {
    currentResourceId,
    type NavigationSection,
} from '../../lib/navigation-sections';
import { useShellNavigation } from '../../model/navigation-context';
import { ResourceRow } from './resource-row';
import styles from './resource-list.module.css';

export function ResourceList({
    section,
    panel = false,
    touch = false,
    filter = '',
    onNavigate,
}: {
    section: NavigationSection;
    panel?: boolean;
    touch?: boolean;
    filter?: string;
    onNavigate?: (() => void) | undefined;
}) {
    const { href, t } = useI18n();
    const pathname = usePathname();
    const { requestWithSession, create } = useShellNavigation();
    const currentId = currentResourceId(section.kind, pathname);
    const validCurrentId =
        currentId && /^[0-9a-f-]{36}$/i.test(currentId) ? currentId : undefined;
    const resources = useNavigationResources(
        {
            enabled: true,
            kind: section.kind,
            query: filter,
            limit: filter.trim() ? 8 : 5,
            ...(validCurrentId ? { currentId: validCurrentId } : {}),
        },
        requestWithSession,
    );
    const items = (resources.data?.resources ?? []).slice(
        0,
        filter.trim() ? 8 : 5,
    );
    const total = resources.isError ? undefined : resources.data?.total;
    const viewAllLabel =
        total !== undefined
            ? `${t('shell.viewAll')} · ${total}`
            : t('shell.viewAll');
    function retry() {
        void resources.refetch();
    }
    function createResource() {
        onNavigate?.();
        create(section.kind);
    }
    const messageClass = panel
        ? styles.message
        : `${styles.message} ${styles.insetMessage}`;
    if (resources.isPending)
        return (
            <div aria-label={t('shell.loading')} className={messageClass}>
                <Skeleton width='80%' />
                <Skeleton width='65%' />
                <Skeleton width='72%' />
            </div>
        );
    return (
        <div className={styles.resources}>
            {resources.isError ? (
                <div className={messageClass} role='alert'>
                    <span>{t('shell.loadFailed')}</span>
                    <button
                        className={styles.inlineAction}
                        onClick={retry}
                        type='button'
                    >
                        <RotateCw size={12} />
                        {t('shell.retry')}
                    </button>
                </div>
            ) : (
                <>
                    {panel && !filter.trim() ? (
                        <p className={styles.recent}>{t('shell.recent')}</p>
                    ) : null}
                    {items.length ? (
                        <ul className={styles.list}>
                            {items.map((resource) => (
                                <ResourceRow
                                    active={resource.id === currentId}
                                    inset={!panel}
                                    key={resource.id}
                                    onNavigate={onNavigate}
                                    resource={resource}
                                    touch={touch}
                                />
                            ))}
                        </ul>
                    ) : (
                        <div className={messageClass}>
                            <span>
                                {t(
                                    filter.trim()
                                        ? 'shell.noMatches'
                                        : section.emptyLabel,
                                )}
                            </span>
                            {!filter.trim() ? (
                                <button
                                    className={styles.inlineAction}
                                    onClick={createResource}
                                    type='button'
                                >
                                    <Plus size={12} />
                                    {t('shell.createAction')}
                                </button>
                            ) : null}
                        </div>
                    )}
                </>
            )}
            <Link
                aria-label={viewAllLabel}
                className={
                    panel
                        ? styles.viewAll
                        : `${styles.viewAll} ${styles.insetViewAll}`
                }
                href={href(section.path)}
                {...(onNavigate ? { onClick: onNavigate } : {})}
            >
                <span>{t('shell.viewAll')}</span>
                {total !== undefined ? (
                    <span className={styles.count}>· {total}</span>
                ) : null}
                <ArrowRight aria-hidden size={14} />
            </Link>
        </div>
    );
}
