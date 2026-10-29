'use client';
import type { FlashcardItem, Presentation } from '../../types';
import type { ReactNode } from 'react';

import styles from './training-launcher.module.css';

import {
    GraduationCap,
    Layers,
    MessageSquareText,
    RefreshCw,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu, type MenuItem } from '@/fsd/shared/ui';
import { createLearningApi } from '../../api/learning-api';
import { useTrainingCapabilities } from '../../hooks/use-training-capabilities';
import type {
    RequestWithSession,
    StartPayload,
    TrainingTarget,
    LearningApi,
} from '../../types';
import type { TrainingLanguage } from '../manual-selection/manual-selection';
import { PracticeSession } from '../practice-session/practice-session';
import { SetupDialog } from '../setup-dialog/setup-dialog';

export interface TrainingLauncherProps {
    renderAudio?(item: FlashcardItem, presentation: Presentation): ReactNode;
    target: TrainingTarget;
    requestWithSession: RequestWithSession;
    signedIn: boolean;
    identity: string;
    dictionaryTitle: string;
    sourceLanguage: TrainingLanguage;
    targetLanguage: TrainingLanguage;
    activeCount: number;
    archived?: boolean;
    className?: string;
    triggerClassName?: string | undefined;
    desktopIconOnly?: boolean;
    placement?: 'top' | 'bottom';
    /** Higher-level composition supplies other learning journeys. */
    additionalItems?: MenuItem[];
}

interface Running {
    id: string;
    payload: StartPayload;
    fullscreen: Promise<boolean>;
}

export function TrainingLauncher(props: TrainingLauncherProps) {
    function resolveTargetIdentity() {
        if (props.target.kind === 'owner') {
            return `owner:${props.target.dictionaryId}`;
        }

        return `shared:${props.target.shareId}:${props.target.shareKey}`;
    }

    const targetIdentity = resolveTargetIdentity();

    const key = `${props.identity}:${props.signedIn}:${targetIdentity}`;

    return <DictionaryLauncher key={key} {...props} />;
}

export type FlashcardPracticeLauncherProps = Omit<
    TrainingLauncherProps,
    'target' | 'requestWithSession'
> & { api: LearningApi };

function DictionaryLauncher(props: TrainingLauncherProps) {
    const targetRef = useRef(props.target);
    const { signedIn, requestWithSession } = props;
    const api = useMemo(
        () =>
            createLearningApi({
                target: targetRef.current,
                signedIn,
                requestWithSession,
            }),
        [signedIn, requestWithSession],
    );
    return <FlashcardPracticeLauncher {...props} api={api} />;
}

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

    const trigger = (
        <span className={labelClassName}>
            <GraduationCap aria-hidden className={styles.icon} />
            <span className={styles.triggerText}>{t('training.train')}</span>
        </span>
    );

    return (
        <div ref={rootRef} className={className}>
            <Menu
                triggerClassName={triggerClassName}
                label={t('training.train')}
                trigger={trigger}
                items={items}
                heading={t('training.menuHeading')}
                variant='secondary'
                showTooltip={desktopIconOnly}
                showChevron={!desktopIconOnly}
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
