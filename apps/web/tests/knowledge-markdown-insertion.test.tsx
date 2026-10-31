import { prepareProposalDocument } from '../src/fsd/features/knowledge-notes/lib/insert-proposal-document';
import type { Editor } from '@tiptap/core';
import { createRef } from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KnowledgeBodySchema, type KnowledgeBody } from '@languon/contracts';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../src/fsd/features/knowledge-notes';
import { hashEditorText } from '../src/fsd/features/knowledge-notes/lib/editor-target-anchor';
import { render } from './render';

function body(text = ''): KnowledgeBody {
    return KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    ...(text ? { content: [{ type: 'text', text }] } : {}),
                },
            ],
        },
    });
}

async function setup(text: string | KnowledgeBody = '') {
    const ref = createRef<KnowledgeEditorHandle>();
    const onChange = vi.fn();
    const value = typeof text === 'string' ? body(text) : text;
    render(<KnowledgeEditor ref={ref} value={value} onChange={onChange} />);
    await waitFor(() => expect(ref.current).not.toBeNull());
    return { ref, onChange };
}

async function target(
    ref: ReturnType<typeof createRef<KnowledgeEditorHandle>>,
    from: number,
    to: number,
) {
    const content = ref.current!.getSnapshot().content;
    return (await ref.current!.restoreTarget({
        documentHash: await hashEditorText(content),
        from,
        to,
        originalText: content.slice(from, to),
    }))!;
}

function apply(
    ref: ReturnType<typeof createRef<KnowledgeEditorHandle>>,
    text: string,
    action: 'append' | 'insert' | 'replace',
    id?: string,
    format?: 'markdown' | 'plain-text',
) {
    let result: string | undefined;
    act(() => {
        result = ref.current!.applyProposal(text, action, id, format);
    });
    return result;
}

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
beforeEach(() => {
    vi.spyOn(Range.prototype, 'getClientRects').mockImplementation(
        () => [] as unknown as DOMRectList,
    );
});

describe('Markdown proposals in the real Knowledge editor', () => {
    it('rejects an invisible link before replacing learner text and retains it through explicit fallback', async () => {
        const { ref, onChange } = await setup('Original.');
        const id = await target(ref, 0, 9);
        const source = 'Prefix [](https://example.com) suffix';
        expect(apply(ref, source, 'replace', id)).toBe('invalid');
        expect(ref.current!.getSnapshot().content).toBe('Original.');
        expect(onChange).not.toHaveBeenCalled();
        expect(apply(ref, source, 'replace', id, 'plain-text')).toBe('applied');
        expect(ref.current!.getSnapshot().content).toBe(source);
    });
    it('includes editor plugin-added paragraphs in atomic node-limit validation', async () => {
        const value = KnowledgeBodySchema.parse({
            schemaVersion: 1,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        // Different marks prevent ProseMirror from merging these
                        // text nodes, without mounting thousands of block rows.
                        content: Array.from({ length: 4_996 }, (_, index) => ({
                            type: 'text',
                            text: 'x',
                            ...(index % 2 ? { marks: [{ type: 'bold' }] } : {}),
                        })),
                    },
                ],
            },
        });
        const { ref, onChange } = await setup(value);
        const element = screen.getByRole('textbox', {
            name: 'Explanation',
            exact: true,
        });
        const editor = (element as HTMLElement & { editor: Editor }).editor;
        const countNodes = (document: typeof editor.state.doc) => {
            let count = 1;
            document.descendants(() => {
                count += 1;
            });
            return count;
        };
        expect(countNodes(editor.state.doc)).toBe(4_998);
        const original = editor.state.doc.toJSON();
        const heading = editor.schema.nodes.heading!.create(
            { level: 2 },
            editor.schema.text('Heading'),
        );
        const candidate = editor.state.applyTransaction(
            editor.state.tr.insert(editor.state.doc.content.size, heading),
        );
        expect(countNodes(candidate.state.doc)).toBe(5_001);
        expect(apply(ref, '## Heading', 'append')).toBe('invalid');
        expect(onChange).not.toHaveBeenCalled();
        expect(editor.state.doc.toJSON()).toEqual(original);
        expect(ref.current!.getSnapshot().content).not.toContain('Heading');
        expect(apply(ref, 'OK', 'append')).toBe('applied');
        expect(countNodes(editor.state.doc)).toBe(5_000);
    });
    it('inserts French Markdown as editable rich JSON, and undo/redo restore the entire change', async () => {
        const { ref, onChange } = await setup();
        expect(
            apply(
                ref,
                '# Времена во французском\n\nФранцузская система: **время** и *вид*.\n\n## 1. Настоящее\n\n- Je parle\n- Tu parles',
                'append',
            ),
        ).toBe('applied');
        const editor = screen.getByRole('textbox', {
            name: 'Explanation',
            exact: true,
        });
        expect(editor.querySelector('h1')?.textContent).toBe(
            'Времена во французском',
        );
        expect(editor.querySelector('strong')?.textContent).toBe('время');
        expect(editor.querySelector('em')?.textContent).toBe('вид');
        expect(editor.querySelectorAll('li')).toHaveLength(2);
        expect(editor.textContent).not.toContain('**');
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(
            KnowledgeBodySchema.safeParse(onChange.mock.calls[0]![0]).success,
        ).toBe(true);
        fireEvent.click(
            screen.getByRole('button', { name: 'Undo', exact: true }),
        );
        expect(ref.current!.getSnapshot().content).toBe('');
        fireEvent.click(
            screen.getByRole('button', { name: 'Redo', exact: true }),
        );
        expect(editor.querySelector('strong')?.textContent).toBe('время');
    });

    it('fits a formatted phrase inline and keeps the remembered target through unrelated edits', async () => {
        const { ref } = await setup('Before. Old wording. After.');
        const selected = await target(ref, 8, 20);
        const above = await target(ref, 0, 0);
        expect(apply(ref, '**Intro.** ', 'insert', above)).toBe('applied');
        expect(apply(ref, '**New** wording.', 'replace', selected)).toBe(
            'applied',
        );
        const editor = screen.getByRole('textbox', {
            name: 'Explanation',
            exact: true,
        });
        expect(editor.querySelectorAll('p')).toHaveLength(1);
        expect(editor.textContent).toContain(
            'Intro. Before. New wording. After.',
        );
        expect(
            Array.from(editor.querySelectorAll('strong')).map(
                (node) => node.textContent,
            ),
        ).toEqual(['Intro.', 'New']);
        fireEvent.click(
            screen.getByRole('button', { name: 'Undo', exact: true }),
        );
        expect(editor.textContent).toContain(
            'Intro. Before. Old wording. After.',
        );
    });

    it('keeps surrounding text for multi-block replacement and requires comparison for changed targets', async () => {
        const { ref } = await setup('Before. Old wording. After.');
        const original = await target(ref, 8, 20);
        const same = await target(ref, 8, 20);
        expect(
            apply(ref, '## New heading\n\nNew paragraph.', 'replace', original),
        ).toBe('applied');
        expect(ref.current!.getSnapshot().content).toContain('Before.');
        expect(ref.current!.getSnapshot().content).toContain('After.');
        expect(apply(ref, '**Unsafe** overwrite', 'replace', same)).toBe(
            'changed',
        );
    });

    it('rejects unsupported replies atomically and retains the target for an explicit literal fallback', async () => {
        const { ref, onChange } = await setup('Original wording.');
        const id = await target(ref, 0, 17);
        const markdown = '```js\nalert(1)\n```';
        expect(apply(ref, markdown, 'replace', id)).toBe('invalid');
        expect(onChange).not.toHaveBeenCalled();
        expect(ref.current!.getSnapshot().content).toBe('Original wording.');
        expect(apply(ref, markdown, 'replace', id, 'plain-text')).toBe(
            'applied',
        );
        expect(ref.current!.getSnapshot().content).toContain('```js');
        expect(document.querySelector('script')).toBeNull();
    });

    it('validates complete document limits before dispatch and leaves editor valid after failure', async () => {
        const { ref, onChange } = await setup('a'.repeat(79_990));
        expect(apply(ref, '**Too many characters here**', 'append')).toBe(
            'invalid',
        );
        expect(onChange).not.toHaveBeenCalled();
        expect(ref.current!.getSnapshot().content.length).toBe(79_990);
        expect(apply(ref, '**OK**', 'append')).toBe('applied');
        expect(onChange).toHaveBeenCalledTimes(1);
    });
});

it('retains the pinned editor HR node size and plain offsets through insertion, anchors and undo', async () => {
    const value = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'A' }],
                },
                { type: 'horizontalRule' },
                { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
            ],
        },
    });
    const { ref, onChange } = await setup(value);
    const element = screen.getByRole('textbox', {
        name: 'Explanation',
        exact: true,
    });
    const editor = (element as HTMLElement & { editor: Editor }).editor;
    expect(editor.state.doc.child(0).nodeSize).toBe(3);
    expect(editor.state.doc.child(1).nodeSize).toBe(1);
    expect(editor.state.doc.nodeAt(3)?.type.name).toBe('horizontalRule');
    expect(editor.state.doc.nodeAt(4)?.type.name).toBe('paragraph');
    expect(ref.current!.getSnapshot().content).toBe('A\n\n\nB');
    const atBoundary = prepareProposalDocument(
        editor,
        {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'Inserted after separator' },
                    ],
                },
            ],
        },
        { from: 4, to: 4 },
        true,
    );
    expect(atBoundary).not.toBeNull();
    act(() => {
        editor.view.dispatch(atBoundary!);
    });
    expect(editor.state.doc.child(1).type.name).toBe('horizontalRule');
    expect(editor.state.doc.child(1).nodeSize).toBe(1);
    expect(editor.state.doc.child(2).textContent).toBe(
        'Inserted after separator',
    );
    expect(editor.state.doc.child(3).textContent).toBe('B');
    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(ref.current!.getSnapshot().content).toBe('A\n\n\nB');
    const afterRule = await target(ref, 4, 5);
    expect(afterRule).toBeTruthy();
    expect(apply(ref, '**New B**', 'replace', afterRule)).toBe('applied');
    expect(editor.state.doc.nodeAt(3)?.type.name).toBe('horizontalRule');
    expect(editor.state.doc.child(2).textContent).toBe('New B');
    expect(
        KnowledgeBodySchema.safeParse(onChange.mock.lastCall?.[0]).success,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(ref.current!.getSnapshot().content).toBe('A\n\n\nB');
    fireEvent.click(screen.getByRole('button', { name: 'Redo', exact: true }));
    expect(editor.state.doc.nodeAt(3)?.nodeSize).toBe(1);
    expect(editor.state.doc.child(2).textContent).toBe('New B');
});

it('exposes Heading 1–3 and a usable horizontal-rule command in the editor toolbar', async () => {
    const { ref, onChange } = await setup('A');
    const selector = screen.getByRole('combobox', { name: 'Paragraph' });
    for (const level of [1, 2, 3]) {
        expect(
            screen.getByRole('option', {
                name: `Heading ${level}`,
                exact: true,
            }),
        ).toBeVisible();
        fireEvent.change(selector, { target: { value: String(level) } });
        expect(
            screen
                .getByRole('textbox', { name: 'Explanation' })
                .querySelector(`h${level}`)?.textContent,
        ).toBe('A');
    }
    fireEvent.click(
        screen.getByRole('button', { name: 'Horizontal rule', exact: true }),
    );
    expect(
        screen
            .getByRole('textbox', { name: 'Explanation' })
            .querySelector('hr'),
    ).not.toBeNull();
    expect(ref.current!.getSnapshot().content).toContain('A');
    expect(
        KnowledgeBodySchema.safeParse(onChange.mock.lastCall?.[0]).success,
    ).toBe(true);
});
