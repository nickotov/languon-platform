import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render } from './render';
import { ResponseActions } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/response-actions';
import { AssistantPanel } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/assistant-panel';

const state = vi.hoisted(() => ({
    sourceProps: undefined as unknown,
    messageProps: undefined as unknown,
    propose: vi.fn(),
    accept: vi.fn(),
}));
vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-assistant-panel',
    () => ({
        useAssistantPanel: (props: unknown) => {
            state.sourceProps = props;
            return {
                chat: {
                    id: 'conversation',
                    list: { isPending: false, data: { conversations: [] } },
                    detail: { isPending: false },
                    create: { isPending: false },
                    submit: { isPending: false },
                    stream: { messages: [], reconnecting: false },
                    attachments: [],
                    useDraft: false,
                    actionFailure: null,
                    quote: null,
                },
                detail: {
                    conversation: {},
                    turns: [],
                    drafts: [{ id: 'private-draft' }],
                },
                preferences: null,
                propose: state.propose,
                acceptProposal: state.accept,
            };
        },
    }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/hooks/use-published-knowledge',
    () => ({
        usePublishedKnowledge: () => ({
            published: { id: 'published' },
            publishedNote: vi.fn(),
        }),
    }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/ui/tutor-shell/tutor-shell',
    () => ({
        TutorShell: ({ children }: { children: ReactNode }) => (
            <section>{children}</section>
        ),
    }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-messages',
    () => ({
        ConversationMessages: (props: { children: ReactNode }) => {
            state.messageProps = props;
            return <div>{props.children}</div>;
        },
    }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-history',
    () => ({ ConversationHistory: () => null }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/assistant-dialogs',
    () => ({ AssistantDialogs: () => null }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/knowledge-draft-card',
    () => ({ KnowledgeDraftCard: () => <button>Apply private draft</button> }),
);
vi.mock(
    '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/published-note-notice',
    () => ({ PublishedNoteNotice: () => <div>Published private note</div> }),
);

const sourceId = '11111111-1111-4111-8111-111111111111';
const panelProps = {
    actorId: sourceId,
    selectedPassage: null,
    folded: false,
    onFold: vi.fn(),
    onExpand: vi.fn(),
    onSelectFromPage: vi.fn(),
};
beforeEach(() => {
    vi.clearAllMocks();
    state.sourceProps = undefined;
    state.messageProps = undefined;
});
describe('shared knowledge read-only assistant controls', () => {
    it('keeps copying available without rendering a proposal action when the callback is absent', () => {
        render(
            <ResponseActions
                text='An explanation'
                canPropose
                disabled={false}
            />,
        );
        expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
        expect(
            screen.queryByRole('button', { name: 'Prepare a Knowledge note' }),
        ).not.toBeInTheDocument();
    });
    it('retains the owner proposal action when an authorized callback exists', () => {
        const propose = vi.fn();
        render(
            <ResponseActions
                text='An explanation'
                canPropose
                onPropose={propose}
                disabled={false}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Prepare a Knowledge note' }),
        );
        expect(propose).toHaveBeenCalledTimes(1);
    });
    it('clears editing context and hides draft/publish controls on shared knowledge sources', () => {
        const workspace = { getSnapshot: vi.fn(), onAcceptProposal: vi.fn() };
        render(
            <AssistantPanel
                {...panelProps}
                source={{
                    kind: 'knowledge',
                    id: sourceId,
                    shareLocator: 'a'.repeat(32),
                }}
                currentDraft='Private working text'
                workspace={workspace}
            />,
        );
        expect(state.sourceProps).toEqual(
            expect.objectContaining({
                workspace: undefined,
                currentDraft: undefined,
            }),
        );
        expect(state.messageProps).toEqual(
            expect.objectContaining({
                onPropose: undefined,
                onAcceptWorkspaceProposal: undefined,
                workspace: undefined,
            }),
        );
        expect(
            screen.queryByRole('button', { name: 'Apply private draft' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByText('Published private note'),
        ).not.toBeInTheDocument();
    });
    it('preserves owner draft and proposal controls for private knowledge sources', () => {
        render(
            <AssistantPanel
                {...panelProps}
                source={{ kind: 'knowledge', id: sourceId }}
            />,
        );
        expect(state.messageProps).toEqual(
            expect.objectContaining({ onPropose: state.propose }),
        );
        expect(
            screen.getByRole('button', { name: 'Apply private draft' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Published private note')).toBeInTheDocument();
    });
    it('keeps owner saved practice read-only while preserving its feedback request', () => {
        const request = { id: 'feedback', prompt: 'Explain my answer' };
        render(
            <AssistantPanel
                {...panelProps}
                source={{ kind: 'knowledge', id: sourceId, view: 'saved' }}
                request={request}
                currentDraft='Private draft'
                workspace={{ getSnapshot: vi.fn(), onAcceptProposal: vi.fn() }}
            />,
        );
        expect(state.sourceProps).toEqual(
            expect.objectContaining({
                request,
                workspace: undefined,
                currentDraft: undefined,
            }),
        );
        expect(state.messageProps).toEqual(
            expect.objectContaining({
                onPropose: undefined,
                onAcceptWorkspaceProposal: undefined,
            }),
        );
        expect(
            screen.queryByRole('button', { name: 'Apply private draft' }),
        ).not.toBeInTheDocument();
    });
});
