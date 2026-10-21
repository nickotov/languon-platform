import { MoreHorizontal, Pin, PinOff } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { NavigationResource } from '@languon/contracts';
import { useResourcePin } from '@/fsd/features/library-navigation';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu } from '@/fsd/shared/ui';
import { useShellNavigation } from '../../model/navigation-context';
import styles from './resource-list.module.css';

export function ResourceRow({
    resource,
    active,
    inset = false,
    touch = false,
    onNavigate,
}: {
    resource: NavigationResource;
    active: boolean;
    inset?: boolean;
    touch?: boolean;
    onNavigate?: (() => void) | undefined;
}) {
    const { href, t } = useI18n();
    const { requestWithSession } = useShellNavigation();
    const pin = useResourcePin(requestWithSession);
    const [pinError, setPinError] = useState(false);
    const meta = resource.description ?? resource.language;
    const title = meta ? `${resource.title} · ${meta}` : resource.title;
    const className = [
        styles.row,
        active ? styles.active : '',
        inset ? styles.inset : '',
        touch ? styles.touch : '',
    ]
        .filter(Boolean)
        .join(' ');
    const pinLabel = t(resource.pinned ? 'shell.unpin' : 'shell.pin');
    function togglePin() {
        setPinError(false);
        pin.mutate(resource, { onError: () => setPinError(true) });
    }
    const menu = [
        {
            label: pinLabel,
            icon: resource.pinned ? <PinOff size={14} /> : <Pin size={14} />,
            disabled: pin.isPending,
            onSelect: togglePin,
        },
    ];
    return (
        <li>
            <div className={className}>
                <Link
                    aria-current={active ? 'page' : undefined}
                    className={styles.link}
                    href={href(resource.href)}
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                    title={title}
                >
                    {inset ? <span aria-hidden className={styles.dot} /> : null}
                    <span className={styles.title}>{resource.title}</span>
                    {meta ? <span className={styles.meta}>{meta}</span> : null}
                    {resource.pinned ? (
                        <Pin aria-label={t('shell.pin')} size={12} />
                    ) : null}
                </Link>
                <Menu
                    allowDisabledItems
                    iconOnly
                    items={menu}
                    label={`${t('shell.resourceMenu')}: ${resource.title}`}
                    trigger={<MoreHorizontal size={14} />}
                    triggerClassName={styles.menu}
                />
            </div>
            {pinError ? (
                <p className={styles.error} role='alert'>
                    {t('shell.pinFailed')}{' '}
                    <button onClick={togglePin} type='button'>
                        {t('shell.retry')}
                    </button>
                </p>
            ) : null}
        </li>
    );
}
