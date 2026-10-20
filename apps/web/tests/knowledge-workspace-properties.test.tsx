import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
    KnowledgeBodySchema,
    type KnowledgeWorkingContent,
} from '@languon/contracts';
import { KnowledgeNoteForm } from '../src/fsd/features/knowledge-notes';
import { render } from './render';

beforeEach(() => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});
afterEach(() => vi.unstubAllGlobals());

it('keeps a single in-canvas title and edits optional properties without changing document content', async () => {
    const onChange = vi.fn();
    const client = new QueryClient();
    client.setQueryData(['dictionary-languages'], { languages: [] });
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const initial: KnowledgeWorkingContent = {
        title: 'Research',
        summary: '',
        studiedLanguage: null,
        explanationLanguage: null,
        categories: [],
        body,
    };
    function Harness() {
        const [value, setValue] = useState(initial);
        function change(
            update: (
                current: KnowledgeWorkingContent,
            ) => KnowledgeWorkingContent,
        ) {
            setValue((current) => {
                const next = update(current);
                onChange(next);
                return next;
            });
        }
        return (
            <QueryClientProvider client={client}>
                <KnowledgeNoteForm
                    value={value}
                    onChange={change}
                    workspace={{
                        toolbarRootId: 'property-toolbar',
                        editorId: 'property-editor',
                        proposalRootId: 'property-proposals',
                        onAskTutor: vi.fn(),
                        onAskOutline: vi.fn(),
                    }}
                />
            </QueryClientProvider>
        );
    }
    render(<Harness />);
    const title = screen.getByRole('textbox', { name: 'Title', exact: true });
    expect(
        screen.getAllByRole('textbox', { name: 'Title', exact: true }),
    ).toHaveLength(1);
    expect(title.closest('article')).not.toBeNull();
    fireEvent.change(title, { target: { value: 'My\nresearch' } });
    expect(title).toHaveValue('My research');
    fireEvent.click(
        screen.getByRole('button', { name: 'Properties', exact: true }),
    );
    fireEvent.click(
        screen.getByRole('button', { name: 'Summary', exact: true }),
    );
    const summary = await screen.findByRole('textbox', {
        name: 'Summary',
        exact: true,
    });
    fireEvent.change(summary, { target: { value: 'A learning document' } });
    await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
                title: 'My research',
                summary: 'A learning document',
                body,
            }),
        ),
    );
});
