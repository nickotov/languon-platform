'use client';
import { useState } from 'react';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, ButtonLink } from '@/fsd/shared/ui';
import { AssistantPanel } from './assistant-panel';
import type { ContextualAssistantProps } from '../../types';

export function ContextualAssistant(props: ContextualAssistantProps) {
    const { locale, href } = useI18n();
    const copy = conversationCopy(locale);
    const actorId = useSessionStore((state) => state.user?.id);
    const [open, setOpen] = useState(false);
    const [passage, setPassage] = useState<string | null>(null);
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
        setPassage(inSource ? selection!.toString().slice(0, 80000) : null);
        setOpen(true);
    }
    function close() {
        setOpen(false);
    }
    if (!actorId)
        return (
            <ButtonLink variant='secondary' href={href('/login')}>
                {copy.signIn}
            </ButtonLink>
        );
    return (
        <>
            <Button type='button' variant='secondary' onClick={show}>
                {copy.open}
            </Button>
            {open && (
                <AssistantPanel
                    key={`${actorId}:${props.source.kind}:${props.source.id}`}
                    {...props}
                    actorId={actorId}
                    passage={passage}
                    onClose={close}
                />
            )}
        </>
    );
}
