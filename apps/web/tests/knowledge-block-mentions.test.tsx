import {
    act,
    fireEvent,
    renderHook,
    screen,
    waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useBlockReferences } from '../src/fsd/widgets/contextual-assistant/hooks/use-block-references';
import {
    BlockReferencePicker,
    BlockReferenceChips,
} from '../src/fsd/widgets/contextual-assistant/ui/contextual-assistant/block-reference-controls';
import {
    knowledgeBlockReferences,
    KnowledgeEditor,
} from '../src/fsd/features/knowledge-notes';
import { KnowledgeBodySchema } from '@languon/contracts';
import type { KnowledgeBlockReference } from '../src/fsd/features/knowledge-notes';
import { render } from './render';

const blocks: KnowledgeBlockReference[] = Array.from({ length: 9 }, (_, i) => ({
    id: `11111111-1111-4111-8111-${String(i + 1).padStart(12, '0')}`,
    type: 'grammar',
    title: `Rule ${i + 1}`,
}));

describe('current note block references', () => {
    it('keeps multiple unique IDs, bounds selection and clears only accepted references', () => {
        const { result } = renderHook(() =>
            useBlockReferences('chat', undefined, blocks),
        );
        act(() => {
            for (const block of blocks) result.current.add(block.id);
            result.current.add(blocks[0]!.id);
        });
        expect(result.current.selected).toHaveLength(8);
        expect(result.current.limitReached).toBe(true);
        act(() => {
            result.current.sent([blocks[0]!.id]);
        });
        expect(result.current.selected).toHaveLength(7);
        expect(result.current.selected[0]?.id).toBe(blocks[1]!.id);
    });
    it('marks removed targets as missing instead of silently dropping or retargeting them', () => {
        const { result, rerender } = renderHook(
            ({ available }) => useBlockReferences('chat', undefined, available),
            { initialProps: { available: blocks } },
        );
        act(() => result.current.add(blocks[0]!.id));
        rerender({ available: blocks.slice(1) });
        expect(result.current.missing).toBe(true);
        expect(result.current.selected[0]?.id).toBe(blocks[0]!.id);
    });
    it('adds editor requests once and clears selections on conversation switch', async () => {
        const request = {
            id: 'request',
            blockIds: [blocks[0]!.id, blocks[1]!.id],
        };
        const { result, rerender } = renderHook(
            ({ id }) => useBlockReferences(id, request, blocks),
            { initialProps: { id: 'chat' } },
        );
        await waitFor(() => expect(result.current.selected).toHaveLength(2));
        rerender({ id: 'other' });
        expect(result.current.selected).toEqual([]);
    });
    it('lets the slash picker select several blocks, search by title and finish explicitly', () => {
        const add = vi.fn();
        const close = vi.fn();
        render(
            <BlockReferencePicker
                available={blocks}
                selected={[]}
                onAdd={add}
                onRemove={vi.fn()}
                onClose={close}
                onTexts={vi.fn()}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: /Rule 1/ }));
        fireEvent.click(screen.getByRole('button', { name: /Rule 2/ }));
        expect(add.mock.calls).toEqual([[blocks[0]!.id], [blocks[1]!.id]]);
        expect(close).not.toHaveBeenCalled();
        fireEvent.change(
            screen.getByRole('textbox', { name: 'Search note blocks' }),
            { target: { value: 'Rule 9' } },
        );
        expect(screen.queryByRole('button', { name: /Rule 1/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledOnce();
    });
    it('shows missing references and removes each chip independently', () => {
        const remove = vi.fn();
        render(
            <BlockReferenceChips
                selected={blocks.slice(0, 2)}
                available={blocks.slice(1)}
                onRemove={remove}
            />,
        );
        expect(screen.getByText('Block removed from note')).toBeVisible();
        fireEvent.click(
            screen.getByRole('button', {
                name: 'Remove block reference: Rule 1',
            }),
        );
        expect(remove).toHaveBeenCalledWith(blocks[0]!.id);
    });
    it('offers the same add-to-chat action in custom block settings without changing content', async () => {
        const value = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: blocks[0]!.id,
                                type: 'grammar',
                                title: 'Rule 1',
                                language: 'en',
                                rule: 'Prepared rule',
                            },
                        },
                    },
                ],
            },
        });
        const mention = vi.fn();
        const change = vi.fn();
        render(
            <KnowledgeEditor
                value={value}
                onChange={change}
                workspace={{
                    toolbarRootId: 'toolbar',
                    editorId: 'editor',
                    proposalRootId: 'proposal',
                    onAskTutor: vi.fn(),
                    onAskOutline: vi.fn(),
                    onMentionBlock: mention,
                }}
            />,
        );
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Block settings: Rule 1',
            }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Add block to chat' }),
        );
        expect(mention).toHaveBeenCalledWith(blocks[0]!.id);
        expect(change).not.toHaveBeenCalled();
        expect(knowledgeBlockReferences(value.document)).toEqual([blocks[0]]);
    });
});

it('rejects oversized grouped requests atomically instead of selecting the first eight', async () => {
    const request = { id: 'group', blockIds: blocks.map((block) => block.id) };
    const { result } = renderHook(() =>
        useBlockReferences('chat', request, blocks),
    );
    await waitFor(() => expect(result.current.limitReached).toBe(true));
    expect(result.current.selected).toEqual([]);
});
it('distinguishes untitled exercise and media blocks with bounded type-specific descriptors', () => {
    const document = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: blocks[0]!.id,
                            type: 'exercise',
                            format: 'free-text',
                            question: 'What happened in this story?',
                            referenceAnswer: 'A prepared answer',
                            explanation: 'A reason',
                        },
                    },
                },
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: blocks[1]!.id,
                            type: 'audio',
                            sourceText: 'A short French conversation.',
                        },
                    },
                },
            ],
        },
    }).document;
    const references = knowledgeBlockReferences(document);
    expect(references.map((item) => item.title)).toEqual([
        'What happened in this story?',
        'A short French conversation.',
    ]);
    expect(references.every((item) => item.title.length <= 200)).toBe(true);
});
