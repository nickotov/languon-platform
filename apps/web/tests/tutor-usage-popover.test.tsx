import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ConversationMessageSchema,
    ConversationTurnSchema,
} from '@languon/contracts';
import { TutorMessage } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/tutor-message';
import { render } from './render';

const id = '00000000-0000-4000-8000-000000000001';
const date = '2026-10-19T10:00:00.000Z';
afterEach(cleanup);

it('opens usage outside the scrolling message on keyboard activation and restores focus on Escape', async () => {
    const user = userEvent.setup();
    const canonical = ConversationMessageSchema.parse({
        id,
        conversationId: id,
        turnId: id,
        role: 'assistant',
        content: 'Example explanation.',
        attachments: [],
        status: 'complete',
        sourceVersion: '1',
        sourceProvenance: 'saved',
        createdAt: date,
    });
    const turn = ConversationTurnSchema.parse({
        id,
        conversationId: id,
        modelId: 'deepseek-flash',
        status: 'succeeded',
        failureCode: null,
        usage: {
            inputTokens: 25,
            outputTokens: 80,
            chargedCredits: '2',
            estimated: false,
        },
        createdAt: date,
        updatedAt: date,
    });
    const { container } = render(
        <>
            <TutorMessage
                message={{
                    id,
                    role: 'assistant',
                    metadata: canonical,
                    parts: [{ type: 'text', text: canonical.content }],
                }}
                changed={false}
                turn={turn}
                active={false}
                hasAssistant
                question='Example?'
                onRetry={vi.fn()}
                onPropose={vi.fn()}
            />
            <button type='button'>Outside chat</button>
        </>,
    );
    const trigger = screen.getByRole('button', { name: 'Charged credits: 2' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    trigger.focus();
    await user.keyboard('{Enter}');
    const usage = await screen.findByRole('dialog', { name: 'Usage' });
    expect(usage.parentElement).toBe(document.body);
    expect(container.contains(usage)).toBe(false);
    expect(usage).toHaveTextContent('Reported');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(usage).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(
        screen.queryByRole('dialog', { name: 'Usage' }),
    ).not.toBeInTheDocument();
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Usage' });
    await user.click(screen.getByRole('button', { name: 'Outside chat' }));
    expect(
        screen.queryByRole('dialog', { name: 'Usage' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
