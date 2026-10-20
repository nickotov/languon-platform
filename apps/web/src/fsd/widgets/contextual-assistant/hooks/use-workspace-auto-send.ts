import { useEffect, useRef } from 'react';
import type { WorkspaceAssistantProps } from '../types';
import type { WorkspacePendingPassage } from './use-workspace-passage';

/** Waits for the selected passage and question to belong to the same editor request. */
export function useWorkspaceAutoSend({
    request,
    question,
    passage,
    ready,
    send,
}: {
    request: WorkspaceAssistantProps['request'];
    question: string;
    passage: WorkspacePendingPassage | null;
    ready: boolean;
    send(): void;
}) {
    const handled = useRef<string | null>(null);
    useEffect(() => {
        if (!request?.autoSend || handled.current === request.id || !ready)
            return;
        if (!request.prompt?.trim() || question !== request.prompt) return;
        if (request.passage ? passage?.id !== request.id : passage !== null)
            return;
        // Mark before invoking Send: StrictMode replay and a synchronous rerender cannot duplicate a turn.
        handled.current = request.id;
        send();
    }, [request, question, passage, ready, send]);
}
