import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    GraduationCapIcon,
    LayersIcon,
    MessageSquareTextIcon,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from '../DropdownMenu';
import { InlineAlert } from '../InlineAlert';
import { PracticeSetup } from './PracticeSetup';
import { PracticeSurface } from './PracticeSurface';
import { PreparationChip } from '../preparation/PreparationChip';
import { PreparationSheet } from '../preparation/PreparationSheet';
import type { NoticeActions } from '../preparation/PreparationNotice';
import { useApp } from '../../contexts/AppContext';
import { usePractice } from '../../contexts/PracticeContext';
import { usePreparation } from '../../contexts/PreparationContext';
import { usePracticeRound } from '../../hooks/usePracticeRound';
import { useIsCompact } from '../../hooks/useMediaQuery';
import { roundSizes } from '../../utils/preparation';
import type { Dictionary } from '../../types/dictionary';
import type { PracticeConfig, Presentation } from '../../types/practice';
import type { PrepRound } from '../../types/preparation';

interface SetupRequest {
    prepare: boolean;
    aiOpen: boolean;
}

/** The dictionary’s learning control (Flashcards + Sentence practice), optional preparation, and the session it opens. */
export function PracticeLauncher({ dictionary }: { dictionary: Dictionary }) {
    const { cardsFor, pushToast } = useApp();
    const practice = usePractice();
    const preparation = usePreparation();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const compact = useIsCompact();
    const triggerRef = useRef<HTMLSpanElement>(null);
    const [setup, setSetup] = useState<SetupRequest | null>(null);
    const [progressOpen, setProgressOpen] = useState(false);
    const [session, setSession] = useState<{
        key: number;
        config: PracticeConfig;
    } | null>(null);
    const [presentation, setPresentation] =
        useState<Presentation>('fullscreen');
    const [fsNotice, setFsNotice] = useState<'unavailable' | 'exited' | null>(
        null,
    );

    const entries = cardsFor(dictionary.id);
    const eligible = entries
        .filter(
            (e) =>
                e.status === 'active' &&
                e.source.trim() &&
                e.translation.trim(),
        )
        .sort((a, b) => a.order - b.order);
    const eligibleCount = eligible.length;
    const run = preparation.runFor(dictionary.id);

    // Deep links from the saved-sentence library: ?practice=setup[&prep=1] or ?practice=progress
    useEffect(() => {
        const request = params.get('practice');
        if (!request) return;
        if (request === 'progress' && run) setProgressOpen(true);
        else if (dictionary.status !== 'archived')
            setSetup({ prepare: params.get('prep') === '1', aiOpen: false });
        const next = new URLSearchParams(params);
        next.delete('practice');
        next.delete('prep');
        setParams(next, { replace: true });
    }, [params, setParams, run, dictionary.status]);

    const restoreFocus = useCallback(() => {
        window.setTimeout(
            () =>
                triggerRef.current
                    ?.querySelector<HTMLElement>('button')
                    ?.focus(),
            0,
        );
    }, []);

    const enterFullscreen = () => {
        if (compact) return;
        if (
            practice.scenario.fullscreenApi === 'unavailable' ||
            !document.documentElement.requestFullscreen
        ) {
            setFsNotice('unavailable');
            return;
        }
        setFsNotice(null);
        document.documentElement
            .requestFullscreen()
            .catch(() => setFsNotice('unavailable'));
    };
    const exitNative = () => {
        if (document.fullscreenElement)
            document.exitFullscreen?.().catch(() => undefined);
    };

    // Native full-screen exit keeps the session in the viewport layout.
    useEffect(() => {
        const onChange = () => {
            if (
                !document.fullscreenElement &&
                session &&
                presentation === 'fullscreen'
            )
                setFsNotice('exited');
        };
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, [presentation, session]);

    const start = (config: PracticeConfig, chosen: Presentation) => {
        if (chosen === 'fullscreen') enterFullscreen();
        else setFsNotice(null);
        setPresentation(chosen);
        setSetup(null);
        setProgressOpen(false);
        setSession({ key: Date.now(), config });
    };

    /** A prepared round uses exactly its ready examples — saved replay, no hidden generation. */
    const startRound = (round: PrepRound) => {
        if (!run) return;
        const sizes = roundSizes(run.roundWords, run.totalWords);
        const offset = sizes
            .slice(0, round.index - 1)
            .reduce((sum, n) => sum + n, 0);
        const entryIds = eligible
            .slice(offset, offset + round.ready)
            .map((e) => e.id);
        start(
            {
                dictionaryId: dictionary.id,
                direction: run.direction,
                sentenceLanguage: run.sentenceLanguage,
                answerLanguage: run.answerLanguage,
                explanationLanguage: dictionary.sourceLanguage,
                mode: 'review',
                entryIds,
                scope: 'manual',
            },
            compact ? 'dialog' : 'fullscreen',
        );
    };

    const toggle = () => {
        if (presentation === 'fullscreen') {
            exitNative();
            setFsNotice(null);
            setPresentation('dialog');
        } else {
            enterFullscreen();
            setPresentation('fullscreen');
        }
    };

    const exit = () => {
        exitNative();
        setSession(null);
        setFsNotice(null);
        restoreFocus();
    };

    const signIn = () => {
        practice.setViewer('reader');
        practice.setScenario({ access: 'ok' });
        pushToast({
            title: 'Signed in',
            description: `Back on “${dictionary.name}”.`,
            variant: 'success',
        });
    };

    const noticeActions: NoticeActions = {
        onResume: () => preparation.resume(dictionary.id),
        onCheckStatus: () => preparation.checkStatus(dictionary.id),
        onStartAgain: () => {
            preparation.dismiss(dictionary.id);
            setProgressOpen(false);
            setSetup({ prepare: true, aiOpen: false });
        },
        onOpenLibrary: () => navigate(`/d/${dictionary.id}/sentences`),
        onOpenAiSettings: () => {
            setProgressOpen(false);
            setSetup({ prepare: true, aiOpen: true });
        },
        onLeave: () => navigate('/'),
        onSignIn: () => {
            preparation.dismiss(dictionary.id);
            setProgressOpen(false);
            signIn();
        },
        onDismissRecovered: () => preparation.clearRecovered(dictionary.id),
    };

    const notice =
        fsNotice === 'unavailable' ? (
            <InlineAlert
                tone='info'
                title='Browser full screen isn’t available'
                onDismiss={() => setFsNotice(null)}
            >
                Practice fills this window instead. Everything works the same.
            </InlineAlert>
        ) : fsNotice === 'exited' ? (
            <InlineAlert
                tone='info'
                title='Browser full screen ended'
                onDismiss={() => setFsNotice(null)}
            >
                Your practice continues here — nothing was reset. Use Close to
                end practice.
            </InlineAlert>
        ) : null;

    return (
        <>
            {run ? (
                <PreparationChip
                    run={run}
                    onOpen={() => setProgressOpen(true)}
                />
            ) : null}
            <span ref={triggerRef} className='inline-flex'>
                <DropdownMenu
                    align='end'
                    menuClassName='bg-background-elevated text-text-primary border-border-default'
                    trigger={
                        <DropdownMenuTrigger className='inline-flex h-10 items-center gap-2 rounded-full border border-border-strong bg-background-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-background-subtle'>
                            <GraduationCapIcon
                                aria-hidden
                                className='h-4 w-4'
                            />
                            Learn
                        </DropdownMenuTrigger>
                    }
                >
                    <DropdownMenuLabel>
                        Practise this dictionary
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        icon={<LayersIcon aria-hidden className='h-4 w-4' />}
                        disabled
                        title='Existing flashcard practice — outside this prototype'
                    >
                        Flashcards
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        icon={
                            <MessageSquareTextIcon
                                aria-hidden
                                className='h-4 w-4'
                            />
                        }
                        disabled={dictionary.status === 'archived'}
                        onSelect={() =>
                            setSetup({ prepare: false, aiOpen: false })
                        }
                    >
                        Sentence practice
                    </DropdownMenuItem>
                </DropdownMenu>
            </span>

            {setup ? (
                <PracticeSetup
                    frame='sheet'
                    dictionary={dictionary}
                    entries={entries}
                    viewer={practice.viewer}
                    initialPrepare={setup.prepare}
                    initialAiSettingsOpen={setup.aiOpen}
                    onClose={() => {
                        setSetup(null);
                        restoreFocus();
                    }}
                    onStart={start}
                    onSignIn={signIn}
                    onPreparationStarted={() => {
                        setSetup(null);
                        setProgressOpen(true);
                    }}
                    onViewPreparation={() => {
                        setSetup(null);
                        setProgressOpen(true);
                    }}
                    onOpenLibrary={() =>
                        navigate(`/d/${dictionary.id}/sentences`)
                    }
                />
            ) : null}

            {run && progressOpen ? (
                <PreparationSheet
                    open
                    run={run}
                    dictionaryName={dictionary.name}
                    onClose={() => {
                        setProgressOpen(false);
                        restoreFocus();
                    }}
                    onStop={() => preparation.stop(dictionary.id)}
                    onStartRound={startRound}
                    actions={noticeActions}
                />
            ) : null}

            {session ? (
                <ActivePractice
                    key={session.key}
                    config={session.config}
                    dictionaryName={dictionary.name}
                    lifetimeTotal={eligibleCount}
                    presentation={presentation}
                    compact={compact}
                    notice={notice}
                    onTogglePresentation={toggle}
                    onExit={exit}
                    onSignIn={signIn}
                />
            ) : null}
        </>
    );
}

interface ActivePracticeProps {
    config: PracticeConfig;
    dictionaryName: string;
    lifetimeTotal: number;
    presentation: Presentation;
    compact: boolean;
    notice: React.ReactNode;
    onTogglePresentation: () => void;
    onExit: () => void;
    onSignIn: () => void;
}

/** Owns the round so presentation changes never restart it. */
function ActivePractice({ config, ...rest }: ActivePracticeProps) {
    const round = usePracticeRound(config);
    return <PracticeSurface round={round} {...rest} />;
}
