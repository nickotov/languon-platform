import { renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { expect, it, vi } from 'vitest';
import { useWorkspaceAutoSend } from '../src/fsd/widgets/contextual-assistant/hooks/use-workspace-auto-send';
import type { WorkspaceAssistantProps } from '../src/fsd/widgets/contextual-assistant';
import type { WorkspacePendingPassage } from '../src/fsd/widgets/contextual-assistant/hooks/use-workspace-passage';

it('sends a quick action once after its question, selection and conversation are ready', () => {
    const request = {
        id: 'request-1',
        passage: 'old wording',
        prompt: 'Correct this passage',
        autoSend: true,
    };
    const send = vi.fn();
    function Wrapper({ children }: PropsWithChildren) {
        return <StrictMode>{children}</StrictMode>;
    }
    const { rerender } = renderHook(
        (props: {
            request: WorkspaceAssistantProps['request'];
            question: string;
            passage: WorkspacePendingPassage | null;
            ready: boolean;
        }) => useWorkspaceAutoSend({ ...props, send }),
        {
            initialProps: {
                request,
                question: 'Previous question',
                passage: null,
                ready: false,
            },
            wrapper: Wrapper,
        },
    );
    rerender({ request, question: request.prompt, passage: null, ready: true });
    expect(send).not.toHaveBeenCalled();
    rerender({
        request,
        question: request.prompt,
        passage: { id: request.id, content: request.passage },
        ready: false,
    });
    expect(send).not.toHaveBeenCalled();
    const ready = {
        request,
        question: request.prompt,
        passage: { id: request.id, content: request.passage },
        ready: true,
    };
    rerender(ready);
    rerender(ready);
    expect(send).toHaveBeenCalledTimes(1);
});

it('does not send Ask actions or an edited quick-action prompt', () => {
    const send = vi.fn();
    const request = { id: 'ask', prompt: 'Explain this passage' };
    const { rerender } = renderHook(
        ({
            request,
            question,
        }: {
            request: WorkspaceAssistantProps['request'];
            question: string;
        }) =>
            useWorkspaceAutoSend({
                request,
                question,
                passage: null,
                ready: true,
                send,
            }),
        { initialProps: { request, question: request.prompt } },
    );
    expect(send).not.toHaveBeenCalled();
    rerender({
        request: { ...request, id: 'auto', autoSend: true },
        question: 'My edited question',
    });
    expect(send).not.toHaveBeenCalled();
});
