'use client';
import { useEffect, useRef, useState } from 'react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink, useCompanionLayout } from '@/fsd/shared/ui';
import { AssistantPanel } from './assistant-panel';
import { SourceSelection } from '../source-selection/source-selection';
import { TutorLauncher } from '../tutor-shell/tutor-launcher';
import type { ContextualAssistantProps } from '../../types';

export function ContextualAssistant(props: ContextualAssistantProps) {
    const actorId = useSessionStore((state) => state.user?.id);
    const { locale, href } = useI18n();
    const copy = conversationCopy(locale);
    if (!actorId)
        return (
            <ButtonLink variant='secondary' href={href('/login')}>
                {copy.signIn}
            </ButtonLink>
        );
    const identity = `${actorId}:${props.source.kind}:${props.source.id}`;
    return <SourceAssistant key={identity} {...props} actorId={actorId} />;
}

function SourceAssistant(
    props: ContextualAssistantProps & { actorId: string },
) {
    const [started, setStarted] = useState(Boolean(props.workspace));
    const [folded, setFolded] = useState(!props.workspace);
    const [selecting, setSelecting] = useState(false);
    const [passage, setPassage] = useState<{ id: string; text: string } | null>(
        null,
    );
    const placement = useCompanionLayout();
    const setExpanded = placement?.setExpanded;
    const setMode = placement?.setMode;
    const setMobileTab = placement?.setMobileTab;
    const isWorkspace = Boolean(props.workspace);
    const effectiveFolded =
        isWorkspace && placement && !placement.detached
            ? placement.mode === 'focus'
            : folded;
    const handledRequest = useRef<string | null>(null);
    const request = props.workspace?.request;
    useEffect(() => {
        if (!request || handledRequest.current === request.id) return;
        handledRequest.current = request.id;
        setStarted(true);
        setFolded(false);
        setSelecting(false);
        if (isWorkspace) {
            setMode?.('split');
            setMobileTab?.('tutor');
        }
    }, [request, isWorkspace, setMode, setMobileTab]);
    useEffect(() => {
        setExpanded?.(started && !effectiveFolded);
        return () => setExpanded?.(false);
    }, [started, effectiveFolded, setExpanded]);
    function expand() {
        setStarted(true);
        setFolded(false);
        setSelecting(false);
        if (isWorkspace) {
            setMode?.('split');
            setMobileTab?.('tutor');
        }
    }
    function fold() {
        if (isWorkspace && placement && !placement.detached) {
            if (window.matchMedia('(max-width: 767px)').matches)
                setMobileTab?.('document');
            else setMode?.('focus');
        }
        setFolded(true);
    }
    function selectFromPage() {
        setSelecting(true);
        setFolded(true);
    }
    function attach(text: string) {
        setPassage({ id: crypto.randomUUID(), text });
        expand();
    }
    function show() {
        const selection = window.getSelection();
        const root = props.selectionRootId
            ? document.getElementById(props.selectionRootId)
            : null;
        const inSource = Boolean(
            root &&
            selection?.anchorNode &&
            selection.focusNode &&
            root.contains(selection.anchorNode) &&
            root.contains(selection.focusNode),
        );
        if (!props.workspace && inSource && selection?.toString().trim())
            attach(selection.toString());
        else expand();
    }
    return (
        <>
            {!props.workspace && (
                <SourceSelection
                    rootId={props.selectionRootId}
                    selecting={selecting}
                    onAttach={attach}
                />
            )}
            {started ? (
                <AssistantPanel
                    {...props}
                    selectedPassage={passage}
                    folded={effectiveFolded}
                    onFold={fold}
                    onExpand={show}
                    onSelectFromPage={selectFromPage}
                />
            ) : (
                <TutorLauncher onOpen={show} />
            )}
        </>
    );
}
