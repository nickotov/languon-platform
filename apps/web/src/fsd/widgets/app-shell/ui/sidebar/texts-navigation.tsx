'use client';
import { FileTextIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import Link from 'next/link';
import styles from './texts-navigation.module.css';
import { NavigationLink } from './navigation-items';

export function TextsNavigation({
    rail,
    onNavigate,
}: {
    rail: boolean;
    onNavigate?: (() => void) | undefined;
}) {
    const { t, href } = useI18n();
    const pathname = usePathname();
    const active = pathname === '/texts' || pathname.startsWith('/texts/');
    function navigate() {
        onNavigate?.();
    }
    return (
        <li>
            {rail ? (
                <Link
                    href={href('/texts')}
                    className={active ? styles.railActive : styles.railLink}
                    aria-current={active ? 'page' : undefined}
                    aria-label={t('texts.manage.navigation')}
                    title={t('texts.manage.navigation')}
                    onClick={navigate}
                >
                    <FileTextIcon size={20} aria-hidden />
                </Link>
            ) : (
                <NavigationLink
                    active={active}
                    href={href('/texts')}
                    label={t('texts.manage.navigation')}
                    icon={<FileTextIcon size={20} aria-hidden />}
                    onNavigate={onNavigate}
                />
            )}
        </li>
    );
}
