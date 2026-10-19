'use client';
import { BookOpenIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/fsd/shared/i18n';
import Link from 'next/link';
import styles from './texts-navigation.module.css';
import { NavigationLink } from './navigation-items';

export function KnowledgeNavigation({
    rail,
    onNavigate,
}: {
    rail: boolean;
    onNavigate?: (() => void) | undefined;
}) {
    const { t, href } = useI18n();
    const pathname = usePathname();
    const active =
        pathname === '/knowledge' || pathname.startsWith('/knowledge/');
    function navigate() {
        onNavigate?.();
    }
    return (
        <li>
            {rail ? (
                <Link
                    href={href('/knowledge')}
                    className={active ? styles.railActive : styles.railLink}
                    aria-current={active ? 'page' : undefined}
                    aria-label={t('knowledge.navigation')}
                    title={t('knowledge.navigation')}
                    onClick={navigate}
                >
                    <BookOpenIcon size={20} aria-hidden />
                </Link>
            ) : (
                <NavigationLink
                    active={active}
                    href={href('/knowledge')}
                    label={t('knowledge.navigation')}
                    icon={<BookOpenIcon size={20} aria-hidden />}
                    onNavigate={onNavigate}
                />
            )}
        </li>
    );
}
