import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import {
    ConversationMessageSchema,
    ConversationTurnSchema,
} from '@languon/contracts';
import { TurnUsage } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/turn-usage';
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
    const trigger = screen.getByRole('button', {
        name: 'Charged credits: 2.00',
    });
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

it('separates failed execution from released billing and preserves unknown measurement', async () => {
    const user = userEvent.setup();
    const turn = ConversationTurnSchema.parse({
        id,
        conversationId: id,
        modelId: 'deepseek-flash',
        status: 'failed',
        failureCode: 'provider_error',
        usage: {
            inputTokens: 25,
            outputTokens: 0,
            chargedCredits: '0',
            estimated: false,
        },
        billing: {
            state: 'released',
            heldCredits: '0.125',
            chargedCredits: '0.000',
            measurement: 'unknown',
        },
        createdAt: date,
        updatedAt: date,
    });
    render(<TurnUsage turn={turn} />);
    await user.click(
        screen.getByRole('button', { name: 'Hold released · no charge' }),
    );
    const usage = await screen.findByRole('dialog', { name: 'Usage' });
    expect(usage).toHaveTextContent('ExecutionFailed');
    expect(usage).toHaveTextContent('BillingHold released · no charge');
    expect(usage).toHaveTextContent('Credits held0.125');
    expect(usage).toHaveTextContent('Charged credits0.000');
    expect(usage).toHaveTextContent('UsageUnknown');
});

it('keeps a tiny estimated charge nonzero and exposes its exact amount', async () => {
    const user = userEvent.setup();
    const turn = ConversationTurnSchema.parse({
        id,
        conversationId: id,
        modelId: 'deepseek-flash',
        status: 'cancelled',
        failureCode: null,
        usage: {
            inputTokens: 25,
            outputTokens: 3,
            chargedCredits: '0.001',
            estimated: true,
        },
        billing: {
            state: 'charged',
            heldCredits: '1.000',
            chargedCredits: '0.001',
            measurement: 'estimated',
        },
        createdAt: date,
        updatedAt: date,
    });
    render(<TurnUsage turn={turn} />);
    await user.click(screen.getByRole('button', { name: 'Charged: <0.01' }));
    const usage = await screen.findByRole('dialog', { name: 'Usage' });
    expect(usage).toHaveTextContent('ExecutionStopped');
    expect(usage).toHaveTextContent('Charged credits0.001');
    expect(usage).toHaveTextContent('Estimated');
});
