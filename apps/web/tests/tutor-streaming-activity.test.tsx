import {
    act,
    render as renderBase,
    renderHook,
    screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
    useStreamingText,
    nextStreamingPrefix,
} from '../src/fsd/widgets/contextual-assistant/hooks/use-streaming-text';
import { TutorActivity } from '../src/fsd/widgets/contextual-assistant/ui/tutor-activity/tutor-activity';
import { render } from './render';
import { I18nProvider } from '@/fsd/shared/i18n';
import { en } from '@/fsd/shared/i18n/messages/en';
import type { ReactNode } from 'react';
function Provider({ children }: { children: ReactNode }) {
    return (
        <I18nProvider locale='en' messages={en}>
            {children}
        </I18nProvider>
    );
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
    Object.defineProperty(document, 'hidden', {
        configurable: true,
        value: false,
    });
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

it('keeps an empty assistant visibly working, shows text activity and returns to working during a pause', () => {
    const view = renderBase(<TutorActivity active queued={false} text='' />, {
        wrapper: Provider,
    });
    expect(screen.getByRole('status')).toHaveAttribute(
        'data-tutor-activity',
        'working',
    );
    view.rerender(<TutorActivity active queued={false} text='Hello' />);
    expect(screen.getByRole('status')).toHaveTextContent('Writing…');
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getByRole('status')).toHaveTextContent('Working…');
    view.rerender(
        <TutorActivity active queued={false} text='Hello' tool='reading' />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Reading context…');
    view.rerender(<TutorActivity active={false} queued={false} text='Hello' />);
    expect(screen.queryByRole('status')).toBeNull();
});
it('labels queued work and localizes the indicator', () => {
    render(<TutorActivity active queued text='' />, { locale: 'fr' });
    expect(screen.getByRole('status')).toHaveTextContent('Préparation…');
});
it('progressively drains a burst, never starves on fast chunks, and flushes final/stop content immediately', () => {
    const view = renderHook(
        ({ content, streaming }) => useStreamingText(content, streaming),
        { initialProps: { content: '', streaming: true } },
    );
    const target = 'A smooth response with a sufficiently large burst of text.';
    view.rerender({ content: target, streaming: true });
    expect(view.result.current).toBe('');
    act(() => vi.advanceTimersByTime(20));
    expect(view.result.current.length).toBeGreaterThan(0);
    expect(view.result.current.length).toBeLessThan(target.length);
    view.rerender({ content: target + ' More.', streaming: true });
    act(() => vi.advanceTimersByTime(10));
    view.rerender({ content: target + ' More. Still more.', streaming: true });
    const before = view.result.current.length;
    act(() => vi.advanceTimersByTime(10));
    expect(view.result.current.length).toBeGreaterThan(before);
    act(() => vi.advanceTimersByTime(180));
    expect(view.result.current).toBe(target + ' More. Still more.');
    view.rerender({ content: 'Replacement', streaming: true });
    expect(view.result.current).toBe('Replacement');
    view.rerender({ content: 'Replacement final', streaming: false });
    expect(view.result.current).toBe('Replacement final');
});
it('does not split combining marks or emoji graphemes', () => {
    expect(nextStreamingPrefix('👩🏽‍💻e\u0301続き', '', 100)).toBe('👩🏽‍💻');
    expect(nextStreamingPrefix('👩🏽‍💻e\u0301続き', '👩🏽‍💻', 100)).toBe('👩🏽‍💻e\u0301');
});
it('renders history immediately and disables reveal for reduced motion', () => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })),
    );
    const view = renderHook(({ content }) => useStreamingText(content, true), {
        initialProps: { content: 'History' },
    });
    expect(view.result.current).toBe('History');
    view.rerender({ content: 'History grows' });
    expect(view.result.current).toBe('History grows');
});
