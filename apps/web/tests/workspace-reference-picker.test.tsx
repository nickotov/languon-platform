import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChangeEvent, PropsWithChildren } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { conversationApi } from '../src/fsd/entities/conversation';
import { useWorkspaceReferencePicker } from '../src/fsd/widgets/contextual-assistant/hooks/use-workspace-reference-picker';

const reference = {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'At the library',
    sourceLanguage: 'en' as const,
    translationLanguage: 'ru' as const,
    hasTranslation: true,
    content: 'Borrow a book. Return it next week.',
    translation: 'Возьмите книгу. Верните её на следующей неделе.',
};

function fixture(active = true, accepted = true) {
    const list = vi
        .spyOn(conversationApi, 'references')
        .mockResolvedValue({ references: [reference] });

    vi.spyOn(conversationApi, 'reference').mockResolvedValue({ reference });
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );
    }

    const onAttach = vi.fn(() => accepted);
    const onClose = vi.fn();
    const hook = renderHook(
        (visible: boolean) =>
            useWorkspaceReferencePicker({
                actorId: 'actor',
                conversationId: 'conversation',
                request: (operation) => operation('synthetic'),
                onAttach,
                onClose,
                active: visible,
            }),
        { initialProps: active, wrapper: Wrapper },
    );

    return { ...hook, list, onAttach, onClose };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it('loads Texts only while their submenu is active and keeps search and detail across submenu switches', async () => {
    const { result, rerender, list } = fixture(false);
    expect(list).not.toHaveBeenCalled();
    act(() => result.current.search('library'));
    rerender(true);
    await waitFor(() => expect(result.current.results.isSuccess).toBe(true));
    expect(list).toHaveBeenCalledWith(
        'synthetic',
        'conversation',
        'library',
        expect.any(AbortSignal),
    );

    act(() => result.current.setSelectedId(reference.id));
    await waitFor(() => expect(result.current.passage).toBe(reference.content));
    rerender(false);
    rerender(true);
    expect(result.current.query).toBe('library');
    expect(result.current.selectedId).toBe(reference.id);
    act(() => result.current.back());
    expect(result.current.query).toBe('library');
    expect(result.current.selectedId).toBeNull();
});

it.each([true, false])(
    'copies the selected source and optional translation; closes only if accepted: %s',
    async (accepted) => {
        const { result, onAttach, onClose } = fixture(true, accepted);
        act(() => result.current.setSelectedId(reference.id));
        await waitFor(() =>
            expect(result.current.passage).toBe(reference.content),
        );

        const textarea = document.createElement('textarea');
        textarea.value = reference.content;
        textarea.setSelectionRange(0, 13);
        result.current.sourceRef.current = textarea;
        act(() => result.current.useSourceSelection());
        act(() =>
            result.current.toggleTranslation({
                target: { checked: true },
            } as ChangeEvent<HTMLInputElement>),
        );

        act(() => result.current.attach());
        expect(onAttach).toHaveBeenCalledWith(
            expect.objectContaining({
                kind: 'text-reference',
                content: 'Borrow a book',
                translation: reference.translation,
            }),
        );

        expect(onClose).toHaveBeenCalledTimes(accepted ? 1 : 0);
    },
);
