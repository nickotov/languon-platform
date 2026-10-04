'use client';

import { BookOpen, ChevronDown, Library, Plus, RotateCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { languageLabel } from '@/fsd/entities/dictionary';
import type { DictionaryNavigationState } from '@/fsd/features/dictionary-library';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton } from '@/fsd/shared/ui';

import type { AppShellState } from '../../hooks/use-app-shell-state';
import type { NavigationVariant } from '../../types';
import { NavigationLink, NavigationLoading } from './navigation-items';
import styles from './sidebar.module.css';

type Props = {
    navigation: DictionaryNavigationState;
    onNavigate?: (() => void) | undefined;
    shell: AppShellState;
    variant: NavigationVariant;
};

export function DictionariesNavigation({
    navigation,
    onNavigate,
    shell,
    variant,
}: Props) {
    const pathname = usePathname();
    const { href, locale, t } = useI18n();
    const sectionActive = pathname.startsWith('/dictionaries');
    const activeId = pathname.startsWith('/dictionaries/')
        ? pathname.split('/')[2]
        : null;

    function openCreate() {
        if (variant === 'drawer') onNavigate?.();
        navigation.openCreate();
    }

    if (variant === 'rail')
        return (
            <>
                <li className={styles.railItem}>
                    {sectionActive ? (
                        <span aria-hidden className={styles.railMarker} />
                    ) : null}
                    <Link
                        aria-current={sectionActive ? 'page' : undefined}
                        aria-label={t('home.dictionaries')}
                        className={styles.railLink}
                        href={href('/dictionaries')}
                        title={t('home.dictionaries')}
                    >
                        <BookOpen aria-hidden size={20} />
                    </Link>
                </li>
                <li className={styles.railItem}>
                    <IconButton
                        icon={<Plus />}
                        label={t('dictionary.create.title')}
                        loading={navigation.create.isPending}
                        onClick={openCreate}
                        tooltipPlacement='right'
                        variant='ghost'
                    />
                </li>
            </>
        );

    const panelId = `${variant}-dictionaries-navigation`;
    const headerActive = sectionActive && !shell.dictionariesOpen;
    return (
        <li>
            <div className={styles.groupHeader}>
                {headerActive ? (
                    <span aria-hidden className={styles.activeMarker} />
                ) : null}
                <button
                    aria-controls={panelId}
                    aria-expanded={shell.dictionariesOpen}
                    className={
                        headerActive ? styles.groupActive : styles.groupButton
                    }
                    onClick={() =>
                        shell.setDictionariesOpen(!shell.dictionariesOpen)
                    }
                    type='button'
                >
                    <BookOpen
                        aria-hidden
                        className={
                            sectionActive ? styles.activeIcon : undefined
                        }
                        size={20}
                    />
                    <span className={styles.groupLabel}>
                        {t('home.dictionaries')}
                    </span>
                    <ChevronDown
                        aria-hidden
                        className={
                            shell.dictionariesOpen
                                ? styles.chevron
                                : styles.chevronClosed
                        }
                        size={16}
                    />
                </button>
                <IconButton
                    className={
                        variant === 'drawer' ? styles.touchButton : undefined
                    }
                    icon={<Plus />}
                    label={t('dictionary.create.title')}
                    loading={navigation.create.isPending}
                    onClick={openCreate}
                    tooltipPlacement='bottom'
                    variant='ghost'
                />
            </div>
            {shell.dictionariesOpen ? (
                <div className={styles.groupPanel} id={panelId}>
                    <ul className={styles.dictionaryList}>
                        <li>
                            <NavigationLink
                                active={pathname === '/dictionaries'}
                                href={href('/dictionaries')}
                                icon={<Library aria-hidden size={16} />}
                                label={t('shell.allDictionaries')}
                                onNavigate={onNavigate}
                            />
                        </li>
                        {navigation.pending ? (
                            <NavigationLoading
                                label={t('shell.loadingDictionaries')}
                            />
                        ) : navigation.loadError ? (
                            <li className={styles.status} role='alert'>
                                <p className={styles.statusText}>
                                    {t('shell.dictionaryLoadFailed')}
                                </p>
                                <button
                                    className={styles.statusButton}
                                    onClick={navigation.retryLoad}
                                    type='button'
                                >
                                    <RotateCw aria-hidden size={14} />
                                    {t('common.retry')}
                                </button>
                            </li>
                        ) : navigation.list.length === 0 ? (
                            <li className={styles.status}>
                                <p className={styles.statusText}>
                                    {t('shell.noDictionaries')}
                                </p>
                                <button
                                    className={styles.statusButton}
                                    onClick={openCreate}
                                    type='button'
                                >
                                    <Plus aria-hidden size={14} />
                                    {t('dictionary.create.title')}
                                </button>
                            </li>
                        ) : (
                            navigation.list.map((dictionary) => (
                                <li key={dictionary.id}>
                                    <NavigationLink
                                        active={activeId === dictionary.id}
                                        description={`${languageLabel(navigation.catalog, dictionary.sourceLanguage, locale)} → ${languageLabel(navigation.catalog, dictionary.targetLanguage, locale)}`}
                                        href={href(
                                            `/dictionaries/${dictionary.id}`,
                                        )}
                                        label={dictionary.name}
                                        onNavigate={onNavigate}
                                    />
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            ) : null}
        </li>
    );
}
