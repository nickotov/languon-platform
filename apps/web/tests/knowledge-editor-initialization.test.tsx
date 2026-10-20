import { createRef } from 'react';
import { act, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../src/fsd/features/knowledge-notes';
import { render } from './render';
import { hashEditorText } from '../src/fsd/features/knowledge-notes/lib/editor-target-anchor';

it('does not report a learner edit when an empty draft editor initializes', async () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const onChange = vi.fn();
    const editor = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={editor} value={body} onChange={onChange} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    expect(editor.current?.getSnapshot().content).toBe('');
    expect(onChange).not.toHaveBeenCalled();
});

it('accepts an append as one editable draft change', async () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const onChange = vi.fn();
    const editor = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={editor} value={body} onChange={onChange} />);
    await waitFor(() => expect(editor.current).not.toBeNull());

    let result: string | undefined;
    act(() => {
        result = editor.current?.applyProposal('A clear explanation', 'append');
    });
    expect(result).toBe('applied');
    expect(editor.current?.getSnapshot().content).toContain(
        'A clear explanation',
    );
    expect(onChange).toHaveBeenCalledTimes(1);
});

it('restores a captured cursor after remount only while the draft is identical', async () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const initial = createRef<KnowledgeEditorHandle>();
    const view = render(
        <KnowledgeEditor ref={initial} value={body} onChange={vi.fn()} />,
    );
    await waitFor(() => expect(initial.current).not.toBeNull());
    const snapshot = initial.current!.getSnapshot();
    const anchor = {
        ...snapshot.editorTarget,
        documentHash: await hashEditorText(snapshot.content),
    };
    view.unmount();

    const restored = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={restored} value={body} onChange={vi.fn()} />);
    await waitFor(() => expect(restored.current).not.toBeNull());
    const targetId = await restored.current!.restoreTarget(anchor);
    expect(targetId).toEqual(expect.any(String));

    const changed = createRef<KnowledgeEditorHandle>();
    const changedBody = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'New' }] },
            ],
        },
    });
    render(
        <KnowledgeEditor
            ref={changed}
            value={changedBody}
            onChange={vi.fn()}
        />,
    );
    await waitFor(() => expect(changed.current).not.toBeNull());
    expect(await changed.current!.restoreTarget(anchor)).toBeNull();
});
