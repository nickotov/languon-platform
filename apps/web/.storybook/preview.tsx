import type { Preview } from '@storybook/nextjs-vite';
import { useEffect, type ReactNode } from 'react';

import '@fontsource-variable/literata';
import '@fontsource-variable/manrope';

import '../src/app/globals.css';

function ThemeCanvas({
    children,
    theme,
}: {
    children: ReactNode;
    theme: string;
}) {
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);
    return <div style={{ maxWidth: 720, padding: 24 }}>{children}</div>;
}

const preview: Preview = {
    decorators: [
        (Story, context) => (
            <ThemeCanvas theme={String(context.globals.theme)}>
                <Story />
            </ThemeCanvas>
        ),
    ],
    globalTypes: {
        theme: {
            defaultValue: 'light',
            toolbar: { items: ['light', 'dark', 'system'] },
        },
    },
    parameters: { a11y: { test: 'error' } },
};
export default preview;
