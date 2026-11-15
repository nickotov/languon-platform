import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from '@testing-library/react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationComposer } from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/ui/conversation-composer/conversation-composer';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';

const noop = vi.fn();
afterEach(cleanup);

it('the real Add context button opens then closes its popup without an outside-dismiss/click race', async () => {
    function Example() {
        const [open, setOpen] = useState(false);
        const [question, setQuestion] = useState('Generate an exercise');
        function toggle() {
            setOpen((current) => !current);
        }

        function close() {
            setOpen(false);
        }

        return (
            <I18nProvider locale='en' messages={en}>
                <ConversationComposer
                    workspace
                    contextOpen={open}
                    onContext={toggle}
                    onCloseContext={close}
                    question={question}
                    onQuestion={setQuestion}
                    onPromptChange={(value) => setQuestion(value.content)}
                    attachments={[]}
                    onRemove={noop}
                    preferences={{}}
                    onPreferences={noop}
                    onDefaults={noop}
                    onSend={noop}
                    onStop={noop}
                    busy={false}
                    active={false}
                    hasDraft={false}
                    useDraft={false}
                    onUseDraft={noop}
                />
                <button type='button'>Outside composer</button>
            </I18nProvider>
        );
    }

    render(
        <QueryClientProvider client={new QueryClient()}>
            <Example />
        </QueryClientProvider>,
    );

    const toggle = screen.getByRole('button', { name: /^Add context/ });
    fireEvent.click(toggle);
    await waitFor(() =>
        expect(toggle).toHaveAttribute('aria-expanded', 'true'),
    );

    const popup = await screen.findByRole('dialog', { name: 'Add to prompt' });
    expect(toggle).toHaveAttribute('aria-controls', popup.id);
    // Use the browser event order: the document's pointerdown handler must not
    // close first, or the following toggle click would immediately reopen it.
    expect(fireEvent.pointerDown(toggle)).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() =>
        expect(toggle).toHaveAttribute('aria-expanded', 'false'),
    );

    expect(screen.queryByRole('dialog', { name: 'Add to prompt' })).toBeNull();

    fireEvent.click(toggle);
    await screen.findByRole('dialog', { name: 'Add to prompt' });
    fireEvent.pointerDown(
        screen.getByRole('button', { name: 'Outside composer' }),
    );

    await waitFor(() =>
        expect(toggle).toHaveAttribute('aria-expanded', 'false'),
    );
});
