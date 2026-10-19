import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// JSDOM has no media-query engine; individual motion/layout tests override this.
window.matchMedia ??= vi.fn((media: string) => ({
    media,
    matches: false,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
}));

// JSDOM has no native modal lifecycle. These supply state/close events only;
// real-browser journeys verify top-layer behavior and focus restoration.
HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
};
HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
};

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});
