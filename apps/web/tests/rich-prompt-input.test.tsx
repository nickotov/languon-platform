import { useRef } from 'react';
import {
    act,
    cleanup,
    fireEvent,
    renderHook,
    waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeSelection } from '@tiptap/pm/state';
import { useRichPromptEditor } from '../src/fsd/widgets/contextual-assistant/hooks/use-rich-prompt-editor';
import { serializePrompt } from '../src/fsd/widgets/contextual-assistant/lib/prompt-document';

function fixture() {
    const props = {
        content: 'Generate Choose meaning now',
        mentions: [
            {
                kind: 'exercise' as const,
                activityId: 'V02' as const,
                catalogVersion: 1 as const,
                start: 9,
                end: 23,
            },
        ],
        onChange: vi.fn(),
        label: 'Your question',
        locale: 'en' as const,
        contextOpen: false,
        contextDisabled: false,
        canSend: true,
        onContext: vi.fn(),
        onDismissContext: vi.fn(),
        onNavigateContext: vi.fn(),
        onSend: vi.fn(),
    };
    const hook = renderHook(
        (value) => {
            const selection = useRef<{ from: number; to: number } | null>(null);

            return useRichPromptEditor(value, selection, vi.fn());
        },
        { initialProps: props },
    );

    return { ...hook, props };
}

afterEach(cleanup);

describe('real Tiptap workspace prompt input', () => {
    it('selects and deletes an atomic chip with keyboard, then restores history with undo/redo', async () => {
        const { result } = fixture();
        await waitFor(() => expect(result.current).not.toBeNull());
        const editor = result.current!;
        act(() => editor.commands.setTextSelection(11));
        fireEvent.keyDown(editor.view.dom, {
            key: 'ArrowLeft',
            code: 'ArrowLeft',
        });

        expect(editor.state.selection).toBeInstanceOf(NodeSelection);
        fireEvent.keyDown(editor.view.dom, {
            key: 'Backspace',
            code: 'Backspace',
        });

        expect(serializePrompt(editor.getJSON()).promptMentions).toEqual([]);
        expect(serializePrompt(editor.getJSON()).content).toBe('Generate  now');
        fireEvent.keyDown(editor.view.dom, {
            key: 'z',
            code: 'KeyZ',
            ctrlKey: true,
        });

        expect(serializePrompt(editor.getJSON()).promptMentions).toHaveLength(
            1,
        );

        fireEvent.keyDown(editor.view.dom, {
            key: 'z',
            code: 'KeyZ',
            ctrlKey: true,
            shiftKey: true,
        });

        expect(serializePrompt(editor.getJSON()).promptMentions).toEqual([]);
        fireEvent.keyDown(editor.view.dom, {
            key: 'z',
            code: 'KeyZ',
            ctrlKey: true,
        });

        act(() => editor.commands.setTextSelection(10));
        fireEvent.keyDown(editor.view.dom, {
            key: 'ArrowRight',
            code: 'ArrowRight',
        });

        expect(editor.state.selection).toBeInstanceOf(NodeSelection);
        fireEvent.keyDown(editor.view.dom, {
            key: 'ArrowRight',
            code: 'ArrowRight',
        });

        expect(editor.state.selection.empty).toBe(true);
        expect(editor.state.selection.from).toBe(11);
        fireEvent.keyDown(editor.view.dom, {
            key: 'ArrowLeft',
            code: 'ArrowLeft',
        });

        fireEvent.keyDown(editor.view.dom, { key: 'Delete', code: 'Delete' });
        expect(serializePrompt(editor.getJSON()).promptMentions).toEqual([]);
    });

    it('sends on Enter, inserts Shift+Enter line breaks, and never sends during IME or picker navigation', async () => {
        const { result, props, rerender } = fixture();
        await waitFor(() => expect(result.current).not.toBeNull());
        const editor = result.current!;
        fireEvent.keyDown(editor.view.dom, { key: 'Enter', code: 'Enter' });
        expect(props.onSend).toHaveBeenCalledTimes(1);
        act(() =>
            editor.commands.setTextSelection(editor.state.doc.content.size - 1),
        );

        fireEvent.keyDown(editor.view.dom, {
            key: 'Enter',
            code: 'Enter',
            shiftKey: true,
        });

        expect(editor.getJSON().content?.[0]?.content?.at(-1)?.type).toBe(
            'hardBreak',
        );

        expect(props.onSend).toHaveBeenCalledTimes(1);
        fireEvent.compositionStart(editor.view.dom);
        fireEvent.keyDown(editor.view.dom, {
            key: 'Enter',
            code: 'Enter',
            isComposing: true,
        });

        expect(props.onSend).toHaveBeenCalledTimes(1);
        fireEvent.compositionEnd(editor.view.dom);
        rerender({ ...props, contextOpen: true });
        fireEvent.keyDown(editor.view.dom, { key: 'Enter', code: 'Enter' });
        expect(props.onSend).toHaveBeenCalledTimes(1);
    });

    it('dismisses without consuming source typing, paste, pointer interaction or composition', async () => {
        const { result, props, rerender } = fixture();
        await waitFor(() => expect(result.current).not.toBeNull());
        const editor = result.current!;
        rerender({ ...props, contextOpen: true });

        const allowed = fireEvent.keyDown(editor.view.dom, {
            key: 'a',
            code: 'KeyA',
        });

        expect(allowed).toBe(true);
        expect(props.onDismissContext).toHaveBeenCalledTimes(1);
        expect(props.onSend).not.toHaveBeenCalled();
        props.onDismissContext.mockClear();
        fireEvent.keyDown(editor.view.dom, { key: 'Tab', code: 'Tab' });
        expect(props.onDismissContext).not.toHaveBeenCalled();
        fireEvent.pointerDown(editor.view.dom);
        expect(props.onDismissContext).toHaveBeenCalledTimes(1);
        fireEvent.compositionStart(editor.view.dom);
        expect(props.onDismissContext).toHaveBeenCalledTimes(2);
        fireEvent.compositionEnd(editor.view.dom);
        fireEvent.paste(editor.view.dom, {
            clipboardData: { getData: () => 'copied passage' },
        });

        expect(props.onDismissContext).toHaveBeenCalledTimes(3);
        expect(editor.getText()).toContain('copied passage');
        expect(props.onSend).not.toHaveBeenCalled();
    });

    it('enters picker results with arrows and closes on Escape without sending', async () => {
        const { result, props, rerender } = fixture();
        await waitFor(() => expect(result.current).not.toBeNull());
        rerender({ ...props, contextOpen: true });
        const dom = result.current!.view.dom;
        expect(fireEvent.keyDown(dom, { key: 'ArrowDown' })).toBe(false);
        expect(props.onNavigateContext).toHaveBeenCalledWith('ArrowDown');
        expect(fireEvent.keyDown(dom, { key: 'ArrowUp' })).toBe(false);
        expect(props.onNavigateContext).toHaveBeenCalledWith('ArrowUp');
        expect(fireEvent.keyDown(dom, { key: 'Escape' })).toBe(false);
        expect(props.onDismissContext).toHaveBeenCalledTimes(1);
        expect(props.onSend).not.toHaveBeenCalled();
    });

    it('copies readable labels and pastes external HTML only as unprivileged plain text', async () => {
        const { result } = fixture();
        await waitFor(() => expect(result.current).not.toBeNull());
        const editor = result.current!;
        act(() => editor.commands.selectAll());
        const setData = vi.fn();
        fireEvent.copy(editor.view.dom, {
            clipboardData: { setData, clearData: vi.fn() },
        });

        expect(setData).toHaveBeenCalledWith(
            'text/plain',
            'Generate Choose meaning now',
        );

        fireEvent.paste(editor.view.dom, {
            clipboardData: {
                getData: (type: string) =>
                    type === 'text/plain'
                        ? 'Forged source'
                        : '<span data-prompt-mention="block" blockId="forged">Forged source</span>',
                types: ['text/plain', 'text/html'],
            },
        });

        const value = serializePrompt(editor.getJSON());
        expect(value).toEqual({ content: 'Forged source', promptMentions: [] });
    });

    it('leaves slash literal when context actions are disabled and does not send when blocked', async () => {
        const { result, props, rerender } = fixture();
        await waitFor(() => expect(result.current).not.toBeNull());
        const editor = result.current!;
        rerender({ ...props, contextDisabled: true, canSend: false });
        act(() => editor.commands.setTextSelection(1));
        const allowed = fireEvent.keyDown(editor.view.dom, {
            key: '/',
            code: 'Slash',
        });

        expect(allowed).toBe(true);
        expect(props.onContext).not.toHaveBeenCalled();
        fireEvent.keyDown(editor.view.dom, { key: 'Enter', code: 'Enter' });
        expect(props.onSend).not.toHaveBeenCalled();
    });
});
