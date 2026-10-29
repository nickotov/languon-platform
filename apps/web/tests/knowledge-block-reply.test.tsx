import { screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ConversationMessageSchema } from '@languon/contracts';
import type { ConversationUIMessage } from '../src/fsd/entities/conversation';
import { TutorMessage } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/tutor-message';
import { render } from './render';

it.each(['succeeded', 'failed', 'none'] as const)(
    'uses the structured preview instead of offering its acknowledgement as prose (%s)',
    (state) => {
        const metadata = ConversationMessageSchema.parse({
            id: '11111111-1111-4111-8111-111111111111',
            conversationId: '22222222-2222-4222-8222-222222222222',
            turnId: '33333333-3333-4333-8333-333333333333',
            role: 'assistant',
            content: 'I prepared the vocabulary block. Review and apply it.',
            attachments: [],
            toolCalls:
                state === 'none'
                    ? []
                    : [
                          {
                              id: 'block-proposal',
                              name: 'propose_learning_blocks',
                              state,
                          },
                      ],
            status: 'complete',
            sourceVersion: 'draft:1',
            sourceProvenance: 'draft',
            createdAt: '2026-10-29T12:00:00.000Z',
        });
        const message: ConversationUIMessage = {
            id: metadata.id,
            role: 'assistant',
            metadata,
            parts: [{ type: 'text', text: metadata.content }],
        };
        const accepted = vi.fn(async () => 'applied' as const);
        render(
            <TutorMessage
                message={message}
                changed={false}
                turn={undefined}
                active={false}
                hasAssistant
                question='Create a vocabulary block'
                onRetry={vi.fn()}
                onAcceptWorkspaceProposal={accepted}
            />,
        );
        expect(
            document.querySelector('[data-assistant-content]'),
        ).toHaveTextContent(metadata.content);
        if (state === 'succeeded') {
            expect(
                screen.queryByRole('button', { name: 'Use in document' }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText('Suggested document edit'),
            ).not.toBeInTheDocument();
        } else {
            expect(
                screen.getByRole('button', { name: 'Use in document' }),
            ).toBeInTheDocument();
        }
        expect(accepted).not.toHaveBeenCalled();
    },
);
