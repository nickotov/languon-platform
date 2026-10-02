import {
    act,
    fireEvent,
    render,
    renderHook,
    screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, type ReactNode } from 'react';
import { Flashcard } from '@/fsd/features/flashcard-training/ui/flashcard/flashcard';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import { useCardInteraction } from '@/fsd/features/flashcard-training/hooks/use-card-interaction';
import {
    requestTrainingFullscreen,
    useTrainingDisplay,
} from '@/fsd/features/flashcard-training/hooks/use-training-display';

afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenElement');
    Reflect.deleteProperty(document, 'exitFullscreen');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

beforeEach(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});

describe('training fullscreen presentation', () => {
    it('releases a late fullscreen grant after the session has unmounted', async () => {
        let element: Element | null = null;
        let resolveRequest!: (granted: boolean) => void;
        const request = new Promise<boolean>((resolve) => {
            resolveRequest = resolve;
        });
        const exit = vi.fn().mockImplementation(async () => {
            element = null;
        });
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => element,
        });
        Object.defineProperty(document, 'exitFullscreen', {
            configurable: true,
            value: exit,
        });
        const { unmount } = renderHook(() => useTrainingDisplay(request));
        unmount();
        await act(async () => {
            await Promise.resolve();
        });
        expect(exit).not.toHaveBeenCalled();
        element = document.documentElement;
        await act(async () => {
            resolveRequest(true);
            await request;
        });
        expect(exit).toHaveBeenCalledOnce();
        expect(document.fullscreenElement).toBeNull();
    });
    it('does not exit Start fullscreen during StrictMode replay but releases it on real unmount', async () => {
        let element: Element | null = document.documentElement;
        const exit = vi.fn().mockImplementation(async () => {
            element = null;
            document.dispatchEvent(new Event('fullscreenchange'));
        });
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            get: () => element,
        });
        Object.defineProperty(document, 'exitFullscreen', {
            configurable: true,
            value: exit,
        });
        const request = Promise.resolve(true);
        function Wrapper({ children }: { children: ReactNode }) {
            return <StrictMode>{children}</StrictMode>;
        }
        const { result, unmount } = renderHook(
            () => useTrainingDisplay(request),
            { wrapper: Wrapper },
        );
        await act(async () => {
            await request;
        });
        expect(result.current.mode).toBe('fullscreen');
        expect(document.fullscreenElement).toBe(document.documentElement);
        expect(exit).not.toHaveBeenCalled();
        unmount();
        await act(async () => {
            await Promise.resolve();
        });
        expect(exit).toHaveBeenCalledOnce();
        expect(document.fullscreenElement).toBeNull();
    });
    it('requests native fullscreen synchronously and catches denied fullscreen', async () => {
        const request = vi.fn().mockRejectedValue(new Error('Not permitted'));
        Object.defineProperty(document.documentElement, 'requestFullscreen', {
            configurable: true,
            value: request,
        });
        const promise = requestTrainingFullscreen();
        expect(request).toHaveBeenCalledTimes(1);
        await expect(promise).resolves.toBe(false);
    });
    it('retains overlay fallback, switches to dialog, and handles native exit', async () => {
        const request = Promise.resolve(false);
        const { result } = renderHook(() => useTrainingDisplay(request));
        await act(async () => {
            await request;
        });
        expect(result.current.mode).toBe('overlay');
        expect(result.current.notice).toBe(true);
        act(() => result.current.toDialog());
        expect(result.current.mode).toBe('dialog');
        const fullscreen = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(document.documentElement, 'requestFullscreen', {
            configurable: true,
            value: fullscreen,
        });
        await act(async () => result.current.toFullscreen());
        expect(result.current.mode).toBe('fullscreen');
        expect(result.current.notice).toBe(false);
        act(() => document.dispatchEvent(new Event('fullscreenchange')));
        expect(result.current.mode).toBe('dialog');
    });
});

function CardHarness({
    onFlip,
    onRate,
    disabled = false,
}: {
    onFlip: ReturnType<typeof vi.fn>;
    onRate: ReturnType<typeof vi.fn>;
    disabled?: boolean;
}) {
    const drag = useCardInteraction({
        onFlip,
        onRate,
        disabled,
        itemKey: 'entry-1',
    });
    return (
        <div
            data-testid='gesture'
            ref={drag.ref}
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
            onPointerCancel={drag.onPointerCancel}
            onClick={drag.onClick}
        >
            <span data-card-text>Long text</span>
            <button type='button'>Flip</button>
        </div>
    );
}

function pointer(
    node: HTMLElement,
    type: string,
    x: number,
    y = 0,
    pointerType = 'touch',
) {
    const event = new Event(type, { bubbles: true });
    Object.assign(event, {
        button: 0,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType,
    });
    fireEvent(node, event);
}

describe('training card drag and text interaction', () => {
    it('declares vertical-only browser panning on the inner scrolling face, not just its outer card', () => {
        render(
            <I18nProvider locale='en' messages={en}>
                <Flashcard
                    item={{
                        entryId: 'entry-1',
                        learningVersion: 1,
                        front: [
                            {
                                field: 'targetExample',
                                requestedFields: ['targetExample'],
                                text: 'A long example.',
                                language: 'en',
                                direction: 'ltr',
                                fallback: false,
                            },
                        ],
                        back: [],
                    }}
                    face='front'
                    position='1 / 1'
                    onFlip={vi.fn()}
                    onRate={vi.fn()}
                    ratingDisabled={false}
                    flipDisabled={false}
                />
            </I18nProvider>,
        );
        const face = screen.getByLabelText('Front of card 1 / 1');
        expect(face).toHaveClass('overflow-y-auto');
        expect(face).toHaveClass('touch-pan-y');
        expect(screen.getByTestId('training-card')).toHaveClass('touch-pan-y');
    });
    function start(disabled = false) {
        const onFlip = vi.fn();
        const onRate = vi.fn();
        const view = render(
            <CardHarness onFlip={onFlip} onRate={onRate} disabled={disabled} />,
        );
        const node = screen.getByTestId('gesture');
        Object.defineProperty(node, 'offsetWidth', {
            configurable: true,
            value: 320,
        });
        node.setPointerCapture = vi.fn();
        node.hasPointerCapture = vi.fn().mockReturnValue(true);
        node.releasePointerCapture = vi.fn();
        return { node, onFlip, onRate, ...view };
    }
    it('rates only after threshold release and suppresses drag-click flip', () => {
        vi.useFakeTimers();
        const { node, onRate, onFlip } = start();
        pointer(node, 'pointerdown', 0);
        pointer(node, 'pointermove', 110);
        expect(onRate).not.toHaveBeenCalled();
        pointer(node, 'pointerup', 110);
        fireEvent.click(node);
        act(() => vi.advanceTimersByTime(300));
        expect(onRate).toHaveBeenCalledExactlyOnceWith('known');
        expect(onFlip).not.toHaveBeenCalled();
    });
    it('does not rate on short drag, return-to-origin, vertical scroll or cancellation', () => {
        const { node, onRate } = start();
        pointer(node, 'pointerdown', 0);
        pointer(node, 'pointermove', 35);
        pointer(node, 'pointerup', 35);
        pointer(node, 'pointerdown', 0);
        pointer(node, 'pointermove', 110);
        pointer(node, 'pointermove', 15);
        pointer(node, 'pointerup', 15);
        pointer(node, 'pointerdown', 0);
        pointer(node, 'pointermove', 30, 140);
        pointer(node, 'pointerup', 30, 140);
        pointer(node, 'pointerdown', 0);
        pointer(node, 'pointermove', -110);
        pointer(node, 'pointercancel', -110);
        expect(onRate).not.toHaveBeenCalled();
    });
    it('allows touch swipes on text but protects mouse text selection', () => {
        const { node, onRate } = start();
        const text = screen.getByText('Long text');
        pointer(text, 'pointerdown', 0, 0, 'mouse');
        pointer(node, 'pointermove', 110, 0, 'mouse');
        pointer(node, 'pointerup', 110, 0, 'mouse');
        expect(onRate).not.toHaveBeenCalled();
        pointer(text, 'pointerdown', 0);
        pointer(node, 'pointermove', -110);
        pointer(node, 'pointerup', -110);
        expect(onRate).toHaveBeenCalledExactlyOnceWith('again');
    });
    it('freezes rating while waiting for server acknowledgement', () => {
        const { node, onRate } = start(true);
        pointer(node, 'pointerdown', 0);
        pointer(node, 'pointermove', 110);
        pointer(node, 'pointerup', 110);
        expect(onRate).not.toHaveBeenCalled();
    });
    it('flips a single click but not a double-click or selected text', () => {
        vi.useFakeTimers();
        const { node, onFlip } = start();
        fireEvent.click(node, { detail: 1 });
        act(() => vi.advanceTimersByTime(221));
        expect(onFlip).toHaveBeenCalledTimes(1);
        fireEvent.click(node, { detail: 1 });
        fireEvent.click(node, { detail: 2 });
        act(() => vi.advanceTimersByTime(221));
        expect(onFlip).toHaveBeenCalledTimes(1);
        vi.spyOn(window, 'getSelection').mockReturnValue({
            toString: () => 'selected',
        } as Selection);
        fireEvent.click(node, { detail: 1 });
        act(() => vi.advanceTimersByTime(221));
        expect(onFlip).toHaveBeenCalledTimes(1);
    });
});
