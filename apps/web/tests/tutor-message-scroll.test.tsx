import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useMessageScroll } from '../src/fsd/widgets/contextual-assistant/hooks/use-message-scroll';

function Transcript({
    identity = 'one',
    content,
}: {
    identity?: string;
    content: string;
}) {
    const scroll = useMessageScroll(identity, content);
    return (
        <>
            <div
                ref={scroll.ref}
                onScroll={scroll.onScroll}
                data-testid='transcript'
            >
                {content}
            </div>
            {scroll.showJump && (
                <button onClick={scroll.jump}>Jump to latest</button>
            )}
        </>
    );
}
function layout() {
    const element = screen.getByTestId('transcript');
    Object.defineProperties(element, {
        scrollHeight: { configurable: true, value: 1000 },
        clientHeight: { configurable: true, value: 300 },
    });
    return element;
}
afterEach(() => {
    window.getSelection()?.removeAllRanges();
    cleanup();
    vi.unstubAllGlobals();
});

it('preserves a scrolled-up reading position as chunks arrive and resumes only after Jump to latest', () => {
    const view = render(<Transcript content='First paragraph' />);
    const transcript = layout();
    transcript.scrollTop = 700;
    fireEvent.scroll(transcript);
    transcript.scrollTop = 100;
    fireEvent.scroll(transcript);
    view.rerender(<Transcript content='First paragraph. More explanation.' />);
    expect(transcript.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    expect(transcript.scrollTop).toBe(1000);
    view.rerender(
        <Transcript content='First paragraph. More explanation. Last chunk.' />,
    );
    expect(transcript.scrollTop).toBe(1000);
    expect(screen.queryByRole('button', { name: 'Jump to latest' })).toBeNull();
});

it('does not move the transcript while the learner selects an answer, and resets follow for a different conversation', () => {
    const view = render(<Transcript content='Select these words' />);
    const transcript = layout();
    transcript.scrollTop = 700;
    fireEvent.scroll(transcript);
    const range = document.createRange();
    range.selectNodeContents(transcript);
    window.getSelection()?.addRange(range);
    act(() => document.dispatchEvent(new Event('selectionchange')));
    view.rerender(
        <Transcript content='Select these words while a new chunk arrives' />,
    );
    expect(transcript.scrollTop).toBe(700);
    window.getSelection()?.removeAllRanges();
    view.rerender(
        <Transcript identity='two' content='A different conversation' />,
    );
    expect(transcript.scrollTop).toBe(1000);
});

it('retains the reading position while folded chunks arrive and restores it when the viewport reopens', () => {
    let resize: (() => void) | undefined;
    vi.stubGlobal(
        'ResizeObserver',
        class {
            constructor(callback: () => void) {
                resize = callback;
            }
            observe() {}
            disconnect() {}
        },
    );
    const view = render(<Transcript content='An earlier explanation' />);
    const transcript = layout();
    transcript.scrollTop = 120;
    fireEvent.scroll(transcript);
    Object.defineProperty(transcript, 'clientHeight', {
        configurable: true,
        value: 0,
    });
    transcript.scrollTop = 0;
    fireEvent.scroll(transcript);
    view.rerender(
        <Transcript content='An earlier explanation and a streamed continuation' />,
    );
    Object.defineProperty(transcript, 'clientHeight', {
        configurable: true,
        value: 300,
    });
    act(() => resize?.());
    expect(transcript.scrollTop).toBe(120);
    expect(
        screen.getByRole('button', { name: 'Jump to latest' }),
    ).toBeInTheDocument();
});
