import { createRef } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
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

it('opens the outline request from a workspace without mutating the private draft', async () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const onChange = vi.fn();
    const onAskOutline = vi.fn();
    const editor = createRef<KnowledgeEditorHandle>();
    render(
        <>
            <div id='test-workspace-toolbar' />
            <KnowledgeEditor
                ref={editor}
                value={body}
                onChange={onChange}
                workspace={{
                    toolbarRootId: 'test-workspace-toolbar',
                    editorId: 'test-document',
                    proposalRootId: 'test-proposals',
                    onAskTutor: vi.fn(),
                    onAskOutline,
                }}
            />
        </>,
    );
    const outline = await screen.findByRole('button', {
        name: /^AI outline/,
    });
    fireEvent.click(outline);
    expect(onAskOutline).toHaveBeenCalledTimes(1);
    expect(editor.current?.getSnapshot().content).toBe('');
    expect(onChange).not.toHaveBeenCalled();
    expect(
        document
            .getElementById('test-workspace-toolbar')
            ?.querySelector('[role="group"]'),
    ).not.toBeNull();
});

it('inserts a lesson starter into only the working body as one undoable edit', async () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: { type: 'doc', content: [{ type: 'paragraph' }] },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    const onChange = vi.fn();
    render(
        <KnowledgeEditor
            ref={editor}
            value={body}
            onChange={onChange}
            workspace={{
                toolbarRootId: 'starter-toolbar',
                editorId: 'starter-document',
                proposalRootId: 'starter-proposals',
                onAskTutor: vi.fn(),
                onAskOutline: vi.fn(),
            }}
        />,
    );
    fireEvent.click(
        await screen.findByRole('button', {
            name: 'Lesson notes',
            exact: true,
        }),
    );
    expect(editor.current!.getSnapshot().content).toContain('Lesson topic');
    expect(editor.current!.getSnapshot().content).toContain('Homework');
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(editor.current!.getSnapshot().content).toBe('');
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(
        screen.getByRole('button', { name: 'Lesson notes', exact: true }),
    ).toBeInTheDocument();
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

it('previews the remembered passage and surrounding text after unrelated edits', async () => {
    const text = 'Before. Selected passage. After.';
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    const onChange = vi.fn();
    render(<KnowledgeEditor ref={editor} value={body} onChange={onChange} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    const targetId = await editor.current!.restoreTarget({
        documentHash: await hashEditorText(text),
        from: 8,
        to: 25,
        originalText: 'Selected passage.',
    });
    expect(targetId).not.toBeNull();
    expect(editor.current!.getProposalPreview(targetId!)).toMatchObject({
        original: 'Selected passage.',
        current: 'Selected passage.',
        before: 'Before. ',
        after: ' After.',
        changed: false,
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.current!.getProposalPreview()).toEqual({
        original: '',
        current: '',
        before: '',
        after: '',
        end: text,
        changed: false,
    });
    expect(editor.current!.getProposalPreview('missing-target')).toBeNull();
    act(() => {
        editor.current!.applyProposal('Added later.', 'append');
    });
    expect(editor.current!.getProposalPreview(targetId!)).toMatchObject({
        current: 'Selected passage.',
        changed: false,
    });
    expect(editor.current!.getProposalPreview(targetId!)?.end).toContain(
        'Added later.',
    );
});

it('keeps the Ask tutor target while the cursor and surrounding document change before Send', async () => {
    const restoreGeometry = mockEditorGeometry();
    try {
        const text = 'Alpha paragraph. Beta paragraph.';
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 1,
            document: {
                type: 'doc',
                content: [
                    { type: 'paragraph', content: [{ type: 'text', text }] },
                ],
            },
        });
        const editor = createRef<KnowledgeEditorHandle>();
        render(
            <KnowledgeEditor ref={editor} value={body} onChange={vi.fn()} />,
        );
        await waitFor(() => expect(editor.current).not.toBeNull());
        const hash = await hashEditorText(text);
        const alpha = await editor.current!.restoreTarget({
            documentHash: hash,
            from: 0,
            to: 16,
            originalText: 'Alpha paragraph.',
        });
        const beta = await editor.current!.restoreTarget({
            documentHash: hash,
            from: 17,
            to: text.length,
            originalText: 'Beta paragraph.',
        });
        act(() => {
            editor.current!.showTarget(alpha!);
        });
        const snapshot = editor.current!.getSnapshot();
        expect(snapshot.targetId).not.toBe(alpha);
        expect(snapshot.selectedPassage).toBe('Alpha paragraph.');
        const withoutPassage = editor.current!.getSnapshot(null);
        expect(withoutPassage.selectedPassage).toBeUndefined();
        expect(withoutPassage.editorTarget).toEqual({
            from: 16,
            to: 16,
            originalText: '',
        });
        expect(withoutPassage.targetId).not.toBe(snapshot.targetId);
        expect(withoutPassage.content).toBe(text);
        expect(editor.current!.getSnapshot().selectedPassage).toBe(
            'Alpha paragraph.',
        );

        act(() => {
            editor.current!.showTarget(beta!);
        });
        expect(editor.current!.getSnapshot().selectedPassage).toBe(
            'Beta paragraph.',
        );
        expect(editor.current!.getSnapshot(snapshot.targetId)).toMatchObject({
            targetId: snapshot.targetId,
            selectedPassage: 'Alpha paragraph.',
            editorTarget: snapshot.editorTarget,
        });

        const beginning = await editor.current!.restoreTarget({
            documentHash: hash,
            from: 0,
            to: 0,
            originalText: '',
        });
        act(() => {
            editor.current!.applyProposal('Added above.', 'insert', beginning!);
        });
        const shifted = editor.current!.getSnapshot(snapshot.targetId);
        expect(shifted.content).toContain('Added above.');
        expect(shifted.selectedPassage).toBe('Alpha paragraph.');
        expect(shifted.editorTarget.from).toBeGreaterThan(
            snapshot.editorTarget.from,
        );
        expect(shifted.editorTarget.originalText).toBe('Alpha paragraph.');

        const editingTarget = await editor.current!.restoreTarget({
            documentHash: await hashEditorText(shifted.content),
            ...shifted.editorTarget,
        });
        act(() => {
            editor.current!.applyProposal(
                'Changed paragraph.',
                'replace',
                editingTarget!,
            );
        });
        const changedSnapshot = editor.current!.getSnapshot(snapshot.targetId);
        expect(changedSnapshot.selectedPassage).toBe('Alpha paragraph.');
        expect(changedSnapshot.content).toContain('Changed paragraph.');
        expect(changedSnapshot.editorTarget.originalText).toBe(
            changedSnapshot.content.slice(
                changedSnapshot.editorTarget.from,
                changedSnapshot.editorTarget.to,
            ),
        );
        expect(
            editor.current!.getProposalPreview(snapshot.targetId)?.changed,
        ).toBe(true);
        expect(
            editor.current!.applyProposal(
                'Unsafe overwrite.',
                'replace',
                snapshot.targetId,
            ),
        ).toBe('changed');
        expect(() => editor.current!.getSnapshot('missing-target')).toThrow(
            'no longer available',
        );
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve()),
        );
    } finally {
        restoreGeometry();
    }
});

it('reveals selection actions for a focused remembered passage in the workspace', async () => {
    const text = 'Selected passage';
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        },
    });
    const editor = createRef<KnowledgeEditorHandle>();
    const onAskTutor = vi.fn();
    const onTutorAction = vi.fn();
    const restoreGeometry = mockEditorGeometry();
    try {
        render(
            <KnowledgeEditor
                ref={editor}
                value={body}
                onChange={vi.fn()}
                workspace={{
                    toolbarRootId: 'test-selection-toolbar',
                    editorId: 'test-selection-document',
                    proposalRootId: 'test-selection-proposals',
                    onAskTutor,
                    onTutorAction,
                    onAskOutline: vi.fn(),
                }}
            />,
        );
        await waitFor(() => expect(editor.current).not.toBeNull());
        const targetId = await editor.current!.restoreTarget({
            documentHash: await hashEditorText(text),
            from: 0,
            to: text.length,
            originalText: text,
        });
        act(() => editor.current!.showTarget(targetId!));
        const ask = await screen.findByRole('button', {
            name: 'Ask tutor',
            exact: true,
        });
        act(() => ask.focus());
        await waitFor(() => expect(document.activeElement).toBe(ask));
        expect(
            screen.getByRole('toolbar', {
                name: 'Selection actions',
                exact: true,
            }),
        ).toContainElement(ask);
        fireEvent.click(ask);
        expect(onAskTutor).toHaveBeenCalledWith(text);
        fireEvent.click(
            screen.getByRole('button', { name: 'Explain', exact: true }),
        );
        expect(onTutorAction).toHaveBeenLastCalledWith('explain', text);
        fireEvent.click(
            screen.getByRole('button', { name: 'More actions', exact: true }),
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Rephrase', exact: true }),
        );
        expect(onTutorAction).toHaveBeenLastCalledWith('rephrase', text);
        expect(editor.current!.getSnapshot().content).toBe(text);
        expect(editor.current!.getProposalPosition(targetId!)).toMatchObject({
            left: -8,
        });
    } finally {
        restoreGeometry();
    }
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

function mockEditorGeometry() {
    const rect = new DOMRect(20, 30, 120, 20);
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => {});
    const originalClientRects = Range.prototype.getClientRects;
    const originalBoundingRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getClientRects = () => [rect] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => rect;
    return () => {
        scroll.mockRestore();
        Range.prototype.getClientRects = originalClientRects;
        Range.prototype.getBoundingClientRect = originalBoundingRect;
    };
}
