'use client';
import { useEffect, useState } from 'react';
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
    const [started, setStarted] = useState(false);
    const [folded, setFolded] = useState(true);
    const [selecting, setSelecting] = useState(false);
    const [passage, setPassage] = useState<{ id: string; text: string } | null>(
        null,
    );
    const placement = useCompanionLayout();
    const setExpanded = placement?.setExpanded;
    useEffect(() => {
        setExpanded?.(started && !folded);
        return () => setExpanded?.(false);
    }, [started, folded, setExpanded]);
    function expand() {
        setStarted(true);
        setFolded(false);
        setSelecting(false);
    }
    function fold() {
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
        if (inSource && selection?.toString().trim())
            attach(selection.toString());
        else expand();
    }
    return (
        <>
            <SourceSelection
                rootId={props.selectionRootId}
                selecting={selecting}
                onAttach={attach}
            />
            {started ? (
                <AssistantPanel
                    {...props}
                    selectedPassage={passage}
                    folded={folded}
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
