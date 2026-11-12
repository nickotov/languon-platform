'use client';
import styles from './training-launcher.module.css';
import {
    GraduationCap,
    Layers,
    MessageSquareText,
    RefreshCw,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu } from '@/fsd/shared/ui';
import { useTrainingCapabilities } from '../../../hooks/use-training-capabilities';
import type { StartPayload } from '../../../types';
import { PracticeSession } from '../../practice-session/practice-session';
import { SetupDialog } from '../../setup-dialog/setup-dialog';
import { type FlashcardPracticeLauncherProps } from '../types';

/** Source adapters supply transport; setup, rounds, gestures, Undo and progress stay shared. */
export function FlashcardPracticeLauncher(
    props: FlashcardPracticeLauncherProps,
) {
    return <Launcher key={`${props.identity}:${props.signedIn}`} {...props} />;
}

function Launcher({
    api,
    renderAudio,
    signedIn,
    dictionaryTitle,
    sourceLanguage,
    targetLanguage,
    activeCount,
    archived = false,
    className,
    triggerClassName,
    placement = 'bottom',
    desktopIconOnly = false,
    additionalItems,
    menuTrigger,
    menuLabel,
}: FlashcardPracticeLauncherProps) {
    const { t } = useI18n();

    const capability = useTrainingCapabilities(api);

    const [setupOpen, setSetupOpen] = useState(false);

    const [running, setRunning] = useState<Running | null>(null);

    const rootRef = useRef<HTMLDivElement>(null);

    function openSetup() {
        setSetupOpen(true);
    }

    function closeSetup() {
        setSetupOpen(false);

        restoreFocus();
    }

    function restoreFocus() {
        requestAnimationFrame(() =>
            rootRef.current
                ?.querySelector<HTMLButtonElement>('button')
                ?.focus(),
        );
    }

    function closeSession() {
        setRunning(null);

        restoreFocus();
    }

    function start(payload: StartPayload, fullscreen: Promise<boolean>) {
        setSetupOpen(false);

        setRunning({ id: crypto.randomUUID(), payload, fullscreen });
    }

    function ignore() {
        /* Disabled menu items never execute. */
    }

    function resolveCardsLabel() {
        if (capability.status === 'loading') {
            return t('training.checking');
        }

        if (capability.status === 'error') {
            return t('training.unavailable');
        }

        if (archived) {
            return t('training.archived');
        }

        return t('training.cards');
    }

    const cardsLabel = resolveCardsLabel();

    const selectCards =
        capability.status === 'error' ? capability.retry : openSetup;

    function resolveCardsIcon() {
        if (capability.status === 'error') {
            return <RefreshCw className={styles.icon} />;
        }

        return <Layers className={styles.icon} />;
    }

    const cardsIcon = resolveCardsIcon();

    const showCards = capability.status !== 'ready' || capability.enabled;

    const cardsItem = {
        label: cardsLabel,
        icon: cardsIcon,
        onSelect: selectCards,
        disabled: capability.status === 'loading' || archived,
        closeOnSelect: capability.status !== 'error',
    };

    const items = [
        ...(showCards ? [cardsItem] : []),
        ...(additionalItems ?? [
            {
                label: t('training.sentenceLabel'),
                hint: t('training.comingSoon'),
                icon: <MessageSquareText className={styles.icon} />,
                onSelect: ignore,
                disabled: true,
            },
        ]),
    ];

    const labelClassName = [
        styles.label,
        desktopIconOnly ? styles.desktopIconOnly : undefined,
    ]
        .filter(Boolean)
        .join(' ');

    const defaultTrigger = (
        <span className={labelClassName}>
            <GraduationCap aria-hidden className={styles.icon} />
            <span className={styles.triggerText}>{t('training.train')}</span>
        </span>
    );

    return (
        <div ref={rootRef} className={className}>
            <Menu
                triggerClassName={triggerClassName}
                label={menuLabel ?? t('training.train')}
                trigger={menuTrigger ?? defaultTrigger}
                iconOnly={Boolean(menuTrigger)}
                items={items}
                heading={t('training.menuHeading')}
                variant='secondary'
                showTooltip={desktopIconOnly}
                showChevron={!desktopIconOnly && !menuTrigger}
                allowDisabledItems
                placement={placement === 'top' ? 'top-end' : 'bottom-end'}
                menuClassName={styles.menu}
            />
            <SetupDialog
                open={setupOpen}
                onClose={closeSetup}
                onStart={start}
                api={api}
                dictionaryTitle={dictionaryTitle}
                sourceLanguage={sourceLanguage}
                targetLanguage={targetLanguage}
                activeCount={activeCount}
                signedIn={signedIn}
            />
            {running && (
                <PracticeSession
                    key={running.id}
                    api={api}
                    renderAudio={renderAudio}
                    sessionId={running.id}
                    payload={running.payload}
                    fullscreenRequest={running.fullscreen}
                    signedIn={signedIn}
                    dictionaryTitle={dictionaryTitle}
                    onClose={closeSession}
                />
            )}
        </div>
    );
}

interface Running {
    id: string;
    payload: StartPayload;
    fullscreen: Promise<boolean>;
}
