import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { conversationUIMessages } from '../src/fsd/entities/conversation';
import { ConversationDetailSchema } from '@languon/contracts';
import { ConversationMessages } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-messages';
import { ConversationApiError } from '../src/fsd/entities/conversation/api/conversation-api';
import { ConversationErrorNotice } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/conversation-error-notice';
import { render } from './render';

afterEach(cleanup);
const providerMessage =
    '<script>Provider credentials or arbitrary raw error</script>';
function error(code: string) {
    return new ConversationApiError(400, {
        code,
        message: providerMessage,
        correlationId: 'safe-test-id',
    });
}

it('offers a safe retry without revealing a model or sending learners to model selection', () => {
    render(
        <ConversationErrorNotice
            error={error('model_unavailable')}
            onRetry={vi.fn()}
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
        'AI is unavailable right now',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(
        screen.getByRole('button', { name: 'Retry response' }),
    ).toBeEnabled();
    expect(screen.queryByText(providerMessage)).not.toBeInTheDocument();
});

it('directs exhausted credits to the balance instead of a model change or blind retry', () => {
    render(
        <ConversationErrorNotice
            error={error('credits_exhausted')}
            onRetry={vi.fn()}
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Check your balance');
    expect(
        screen.getByRole('link', { name: 'View credit balance' }),
    ).toHaveAttribute('href', '/profile?tab=credits');
    expect(
        screen.queryByRole('button', { name: 'Retry response' }),
    ).not.toBeInTheDocument();
});

it('offers retry for temporary capacity exhaustion and keeps unknown failures generic', () => {
    const retry = vi.fn();
    render(
        <ConversationErrorNotice
            error={error('capacity_unavailable')}
            onRetry={retry}
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('assistant is busy');
    fireEvent.click(screen.getByRole('button', { name: 'Retry response' }));
    expect(retry).toHaveBeenCalledOnce();
    cleanup();
    render(
        <ConversationErrorNotice
            error={error('unknown_provider_error')}
            onRetry={retry}
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Could not load or update',
    );
    expect(screen.queryByText(providerMessage)).not.toBeInTheDocument();
});

it('associates each failed/cancelled Retry with its original learner question', () => {
    const conversationId = '00000000-0000-4000-8000-000000000001';
    const firstId = '00000000-0000-4000-8000-000000000002';
    const secondId = '00000000-0000-4000-8000-000000000003';
    const date = '2026-10-19T10:00:00.000Z';
    const turn = {
        conversationId,
        modelId: null,
        failureCode: null,
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            chargedCredits: '0',
            estimated: false,
        },
        createdAt: date,
        updatedAt: date,
    };
    const message = {
        conversationId,
        role: 'user',
        attachments: [],
        status: 'complete',
        sourceVersion: '1',
        sourceProvenance: 'saved',
        createdAt: date,
    };
    const detail = ConversationDetailSchema.parse({
        conversation: {
            id: conversationId,
            title: null,
            source: { kind: 'text', id: conversationId },
            preferences: {},
            version: 1,
            createdAt: date,
            updatedAt: date,
        },
        messages: [
            {
                ...message,
                id: firstId,
                turnId: firstId,
                content: 'Stopped question',
            },
            {
                ...message,
                id: secondId,
                turnId: secondId,
                content: 'Provider failed question',
            },
        ],
        turns: [
            { ...turn, id: firstId, status: 'cancelled' },
            { ...turn, id: secondId, status: 'failed' },
        ],
        drafts: [],
    });
    const retry = vi.fn();
    render(
        <ConversationMessages
            detail={detail}
            uiMessages={conversationUIMessages(detail)}
            active={false}
            onRetry={retry}
            onPropose={vi.fn()}
        />,
    );
    const failed = screen.getByRole('region', {
        name: 'Incomplete response: Provider failed question',
    });
    fireEvent.click(
        within(failed).getByRole('button', { name: 'Retry response' }),
    );
    expect(retry).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: secondId }),
    );
    expect(
        within(
            screen.getByRole('region', {
                name: 'Incomplete response: Stopped question',
            }),
        ).queryByRole('alert'),
    ).not.toBeInTheDocument();
});

it.each([
    {
        estimated: true,
        status: 'failed',
        label: 'Estimated',
        absent: 'Reported',
    },
    {
        estimated: false,
        status: 'succeeded',
        label: 'Reported',
        absent: 'Estimated',
    },
])(
    'keeps $status response feedback without credit or token disclosures',
    async ({ estimated, status }) => {
        const id = '00000000-0000-4000-8000-000000000001';
        const date = '2026-10-19T10:00:00.000Z';
        const detail = ConversationDetailSchema.parse({
            conversation: {
                id,
                title: null,
                source: { kind: 'text', id },
                preferences: {},
                version: 1,
                createdAt: date,
                updatedAt: date,
            },
            messages: [
                {
                    id,
                    conversationId: id,
                    turnId: id,
                    role: 'assistant',
                    content: 'A river bank is land beside a river.',
                    attachments: [],
                    status: status === 'failed' ? 'incomplete' : 'complete',
                    sourceVersion: '1',
                    sourceProvenance: 'saved',
                    createdAt: date,
                },
            ],
            drafts: [],
            turns: [
                {
                    id,
                    conversationId: id,
                    modelId: null,
                    status,
                    failureCode: null,
                    usage: {
                        inputTokens: 64000,
                        outputTokens: 4096,
                        chargedCredits: '37',
                        estimated,
                    },
                    createdAt: date,
                    updatedAt: date,
                },
            ],
        });
        const { container } = render(
            <ConversationMessages
                detail={detail}
                uiMessages={conversationUIMessages(detail)}
                active={false}
                onRetry={vi.fn()}
                onPropose={vi.fn()}
            />,
        );
        expect(
            screen.queryByRole('dialog', { name: 'Usage' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Charged credits/ }),
        ).not.toBeInTheDocument();
        expect(container).toHaveTextContent(
            'A river bank is land beside a river.',
        );
        expect(container).not.toHaveTextContent('64000');
        expect(container).not.toHaveTextContent('4096');
        if (status === 'failed')
            expect(
                screen.getByRole('button', { name: 'Retry response' }),
            ).toBeEnabled();
        else
            expect(
                screen.getByRole('button', { name: 'Copy', exact: true }),
            ).toBeEnabled();
    },
);

it('directs an oversized context to shorten its question or remove attachments before sending again', () => {
    render(
        <ConversationErrorNotice
            error={error('context_too_large')}
            onRetry={vi.fn()}
        />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
        'Shorten the question or remove attachments',
    );
    expect(
        screen.queryByRole('button', { name: 'Retry response' }),
    ).not.toBeInTheDocument();
});
