'use client';

import {
    GraduationCap,
    Layers,
    MessageSquareText,
    RefreshCw,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Menu } from '@/fsd/shared/ui';
import { createLearningApi } from '../../api/learning-api';
import { useTrainingCapabilities } from '../../hooks/use-training-capabilities';
import type {
    RequestWithSession,
    StartPayload,
    TrainingTarget,
} from '../../types';
import type { TrainingLanguage } from '../manual-selection/manual-selection';
import { PracticeSession } from '../practice-session/practice-session';
import { SetupDialog } from '../setup-dialog/setup-dialog';

export interface TrainingLauncherProps {
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
    placement?: 'top' | 'bottom';
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

    return <Launcher key={key} {...props} />;
}

function Launcher({
    target,
    requestWithSession,
    signedIn,
    dictionaryTitle,
    sourceLanguage,
    targetLanguage,
    activeCount,
    archived = false,
    className,
    triggerClassName,
    placement = 'bottom',
}: TrainingLauncherProps) {
    const { t } = useI18n();

    const targetRef = useRef(target);

    const api = useMemo(
        () =>
            createLearningApi({
                target: targetRef.current,
                signedIn,
                requestWithSession,
            }),
        [signedIn, requestWithSession],
    );

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
            return <RefreshCw className='h-4 w-4' />;
        }

        return <Layers className='h-4 w-4' />;
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
        {
            label: t('training.sentenceLabel'),
            hint: t('training.comingSoon'),
            icon: <MessageSquareText className='h-4 w-4' />,
            onSelect: ignore,
            disabled: true,
        },
    ];

    const trigger = (
        <span className='inline-flex items-center gap-2'>
            <GraduationCap aria-hidden className='h-4 w-4' />
            {t('training.train')}
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
                showChevron
                allowDisabledItems
                placement={placement === 'top' ? 'top-end' : 'bottom-end'}
                menuClassName='min-w-56 shadow-elevation-md'
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
