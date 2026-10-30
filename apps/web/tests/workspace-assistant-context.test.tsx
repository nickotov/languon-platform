import { act, renderHook, waitFor } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import type { PropsWithChildren } from 'react';
import type { CopiedAttachment } from '@languon/contracts';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { useConversation } from '../src/fsd/widgets/contextual-assistant/hooks/use-conversation';
import { useAssistantPanel } from '../src/fsd/widgets/contextual-assistant/hooks/use-assistant-panel';
import type { WorkspaceAssistantProps } from '../src/fsd/widgets/contextual-assistant';

vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-conversation',
    () => ({ useConversation: vi.fn() }),
);
vi.mock('../src/fsd/features/auth', () => ({
    useAuth: () => ({ requestWithSession: vi.fn() }),
}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const passage = 'Selected passage A';
const anchor = { from: 0, to: passage.length, originalText: passage };
function Wrapper({ children }: PropsWithChildren) {
    return (
        <I18nProvider locale='en' messages={en}>
            {children}
        </I18nProvider>
    );
}
function fixture() {
    vi.stubGlobal('crypto', webcrypto);
    const chat = {
        id: 'chat-one',
        active: undefined,
        question: 'Explain the selected passage',
        attachments: [] as CopiedAttachment[],
        setQuestion: vi.fn(),
        setAttachments: vi.fn<(attachments: CopiedAttachment[]) => void>(),
        select: vi.fn(),
        remove: vi.fn(),
        list: { isSuccess: true, isError: false },
        detail: { data: { conversation: { preferences: {} } }, isError: false },
        create: { mutate: vi.fn(), isPending: false },
        submit: {
            mutateAsync: vi
                .fn<(request: unknown) => Promise<{ turn: { id: string } }>>()
                .mockImplementation(async (request) => {
                    const turn = { id: 'turn-one' };
                    // Production submission invokes onAccepted after durable admission.
                    // Preserve that contract so passage cleanup is exercised here.
                    (
                        request as {
                            onAccepted?: (turn: { id: string }) => void;
                        }
                    ).onAccepted?.(turn);
                    return { turn };
                }),
            isPending: false,
        },
        stream: { unavailable: false },
    };
    chat.setAttachments.mockImplementation((attachments) => {
        chat.attachments = attachments;
    });
    vi.mocked(useConversation).mockReturnValue(
        chat as unknown as ReturnType<typeof useConversation>,
    );
    const snapshot = vi.fn(() => ({
        content: `${passage}\nCurrent surrounding paragraph.`,
        targetId: 'target-a',
        editorTarget: anchor,
    }));
    const workspace: WorkspaceAssistantProps = {
        request: { id: 'request-one', passage, targetId: 'target-a' },
        referenceLimit: 5,
        getSnapshot: snapshot,
        onAcceptProposal: vi.fn(() => 'applied'),
        restoreTarget: vi.fn(async () => 'newly-restored'),
    };
    const props = {
        actorId: 'actor',
        folded: false,
        selectedPassage: { id: 'legacy', text: passage },
        source: { kind: 'knowledge' as const, id: 'note' },
        workspace,
    };
    return { chat, snapshot, workspace, props };
}

it('keeps an explicit editor passage outside the reference budget and sends its captured target with the latest full document', async () => {
    const { chat, snapshot, props } = fixture();
    const { result } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() =>
        expect(result.current.workspacePassage?.targetId).toBe('target-a'),
    );
    expect(chat.setAttachments).not.toHaveBeenCalled();
    // A passage longer than the five-character reference allowance cannot consume it.
    act(() => {
        expect(
            result.current.attach({
                id: 'reference',
                label: 'External reference',
                content: '12345',
            }),
        ).toBe(true);
    });
    snapshot.mockReturnValue({
        content: `${passage}\nEdited surrounding paragraph and cursor B.`,
        targetId: 'target-a',
        editorTarget: anchor,
    });
    act(() => result.current.send());
    await waitFor(() => expect(chat.submit.mutateAsync).toHaveBeenCalledOnce());
    expect(snapshot).toHaveBeenCalledWith('target-a');
    const request = vi.mocked(chat.submit.mutateAsync).mock.calls[0]?.[0];
    expect(request).toMatchObject({
        copiedAttachments: [
            { id: 'reference', label: 'External reference', content: '12345' },
        ],
        editorContext: {
            content: `${passage}\nEdited surrounding paragraph and cursor B.`,
            selectedText: passage,
            editorTarget: anchor,
        },
    });
    await waitFor(() => expect(result.current.workspacePassage).toBeNull());
});

it('preserves the question and pending passage when that passage changed before sending', async () => {
    const { chat, snapshot, props } = fixture();
    const { result, rerender } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    snapshot.mockReturnValue({
        content: 'Changed passage',
        targetId: 'target-a',
        editorTarget: { from: 0, to: 15, originalText: 'Changed passage' },
    });
    act(() => result.current.send());
    expect(chat.submit.mutateAsync).not.toHaveBeenCalled();
    expect(result.current.attachmentError).toContain(
        'Select the passage again',
    );
    expect(result.current.workspacePassage?.content).toBe(passage);
    expect(chat.setQuestion).not.toHaveBeenCalled();
    props.workspace.request = {
        id: 'reselected',
        passage,
        targetId: 'target-a',
    };
    rerender();
    await waitFor(() => expect(result.current.attachmentError).toBeNull());
    act(() => result.current.send());
    expect(result.current.attachmentError).toContain(
        'Select the passage again',
    );
    act(() => result.current.removeWorkspacePassage());
    expect(result.current.attachmentError).toBeNull();
});

it('retains an unrelated reference-limit error when a passage is removed or selected again', async () => {
    const { props } = fixture();
    const { result, rerender } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    act(() => {
        expect(
            result.current.attach({
                id: 'large-reference',
                label: 'Too large',
                content: '123456',
            }),
        ).toBe(false);
    });
    const referenceError = result.current.attachmentError;
    expect(referenceError).toContain('Reference text exceeds');
    act(() => result.current.removeWorkspacePassage());
    expect(result.current.attachmentError).toBe(referenceError);
    props.workspace.request = {
        id: 'selected-again',
        passage,
        targetId: 'target-a',
    };
    rerender();
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    expect(result.current.attachmentError).toBe(referenceError);
});

it('preserves the active pending passage when another chat is deleted and clears it when the active chat changes', async () => {
    const { chat, props } = fixture();
    const { result, rerender } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    act(() => result.current.deleteFromHistory('another-chat'));
    await act(async () => {
        await result.current.confirmDelete();
    });
    expect(chat.remove).toHaveBeenCalledWith('another-chat');
    expect(result.current.workspacePassage?.content).toBe(passage);
    chat.id = 'different-active-chat';
    rerender();
    await waitFor(() => expect(result.current.workspacePassage).toBeNull());
});

it('accepts against the target already restored for review instead of rechecking an outdated whole-document hash', async () => {
    const { workspace, props } = fixture();
    const { result } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await act(async () => {
        await result.current.acceptProposal(
            'Proposed wording',
            'replace',
            'turn-one',
            { ...anchor, documentHash: 'a'.repeat(64) },
            'mapped-review-target',
        );
    });
    expect(workspace.onAcceptProposal).toHaveBeenCalledWith(
        'Proposed wording',
        'replace',
        'mapped-review-target',
        undefined,
    );
    expect(workspace.restoreTarget).not.toHaveBeenCalled();
});

it('removes the explicit passage and requests a collapsed cursor snapshot instead of retaining a hidden replacement selection', async () => {
    const { chat, snapshot, props } = fixture();
    const { result } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    act(() => result.current.removeWorkspacePassage());
    snapshot.mockReturnValue({
        content: `${passage}\nCurrent surrounding paragraph.`,
        targetId: 'collapsed-cursor',
        editorTarget: {
            from: passage.length,
            to: passage.length,
            originalText: '',
        },
    });
    act(() => result.current.send());
    await waitFor(() => expect(chat.submit.mutateAsync).toHaveBeenCalledOnce());
    expect(snapshot).toHaveBeenCalledWith(null);
    const request = chat.submit.mutateAsync.mock.calls[0]?.[0];
    expect(request).toMatchObject({
        copiedAttachments: [],
        editorContext: {
            selectedText: undefined,
            editorTarget: {
                from: passage.length,
                to: passage.length,
                originalText: '',
            },
        },
    });
    expect(result.current.workspacePassage).toBeNull();
});

it('sends the actual recovered working branch together with its frozen editor snapshot', async () => {
    const { chat, workspace, props } = fixture();
    const branch = { id: '11111111-1111-4111-8111-111111111111', version: 8 };
    workspace.beforeSend = vi.fn().mockResolvedValue(branch);
    const { result } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    act(() => result.current.send());
    await waitFor(() => expect(chat.submit.mutateAsync).toHaveBeenCalledOnce());
    expect(workspace.beforeSend).toHaveBeenCalledTimes(1);
    expect(chat.submit.mutateAsync.mock.calls[0]?.[0]).toMatchObject({
        editorContext: {
            workingBranch: branch,
            content: `${passage}\nCurrent surrounding paragraph.`,
        },
    });
});

it('retains the question and rejects admission if the editor changes while recovery is pending', async () => {
    const { chat, snapshot, workspace, props } = fixture();
    let finish: ((branch: { id: string; version: number }) => void) | undefined;
    workspace.beforeSend = vi.fn(
        () =>
            new Promise<{ id: string; version: number }>((resolve) => {
                finish = resolve;
            }),
    );
    const { result } = renderHook(() => useAssistantPanel(props), {
        wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.workspacePassage).not.toBeNull());
    act(() => result.current.send());
    await waitFor(() => expect(workspace.beforeSend).toHaveBeenCalledOnce());
    snapshot.mockReturnValue({
        content: `${passage}\nNewer typing during recovery.`,
        targetId: 'target-a',
        editorTarget: anchor,
    });
    await act(async () => {
        finish?.({ id: '11111111-1111-4111-8111-111111111111', version: 8 });
    });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect((result.current.error as Error).message).toContain(
        'document changed',
    );
    expect(chat.submit.mutateAsync).not.toHaveBeenCalled();
    expect(chat.setQuestion).not.toHaveBeenCalled();
    expect(result.current.workspacePassage?.content).toBe(passage);
});

it('freezes selected block references at Send and preserves references added during draft flushing', async () => {
    const { chat, props, workspace } = fixture();
    const blocks = [1, 2, 3].map((index) => ({
        id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        type: 'grammar' as const,
        title: `Rule ${index}`,
    }));
    workspace.request = {
        ...workspace.request!,
        blockIds: [blocks[0]!.id, blocks[1]!.id],
    };
    let complete!: (branch: { id: string; version: number }) => void;
    workspace.beforeSend = vi.fn(
        () =>
            new Promise((resolve) => {
                complete = resolve;
            }),
    );
    const { result } = renderHook(
        () => useAssistantPanel({ ...props, blocks }),
        { wrapper: Wrapper },
    );
    await waitFor(() =>
        expect(result.current.blockReferences.selected).toHaveLength(2),
    );
    act(() => result.current.send());
    act(() => result.current.blockReferences.add(blocks[2]!.id));
    await act(async () => {
        complete({ id: 'branch', version: 1 });
    });
    await waitFor(() => expect(chat.submit.mutateAsync).toHaveBeenCalledOnce());
    expect(chat.submit.mutateAsync.mock.calls[0]?.[0]).toMatchObject({
        blockReferences: [blocks[0]!.id, blocks[1]!.id],
    });
    expect(
        result.current.blockReferences.selected.map((item) => item.id),
    ).toEqual([blocks[2]!.id]);
});
