import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
    AdminAiCatalogEntry,
    AdminAiCatalogSummary,
} from '@languon/contracts';
import { adminI18nProvider } from '@/shared/i18n/admin-i18n-provider';
import { CatalogEntryDetail } from './catalog-entry-detail';

vi.mock('@refinedev/core', () => ({
    useTranslate: () => adminI18nProvider.translate,
}));

beforeEach(() => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({
            matches: false,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        }),
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const prompt: AdminAiCatalogEntry = {
    id: 'example-prompt',
    kind: 'prompt',
    name: 'Example prompt',
    description: 'Synthetic prompt for safe rendering.',
    module: 'example',
    scope: 'application',
    references: [{ kind: 'agent', id: 'example-agent' }],
    limitations: ['Learner context is added at runtime.'],
    content:
        'Translate this literal text: <img src=x onerror="alert(1)">\nKeep line breaks.',
    sourcePath: 'packages/prompts/src/local/example.ts',
};
const related: AdminAiCatalogSummary = {
    id: 'example-agent',
    kind: 'agent',
    name: 'Example agent',
    description: 'Synthetic relationship.',
    module: 'example',
    scope: 'application',
    references: [],
};

it('shows exact prompt text without interpreting HTML and lets the admin inspect related definitions', () => {
    const onSelect = vi.fn();
    const { container } = render(
        <CatalogEntryDetail
            entry={prompt}
            entries={[related]}
            onSelect={onSelect}
        />,
    );
    const code = screen.getByLabelText('Prompt template', { selector: 'pre' });
    expect(code.textContent).toBe(prompt.content);
    const relationships = screen.getByRole('region', {
        name: 'Related definitions',
    });

    expect(
        code.compareDocumentPosition(relationships) &
            Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(container.querySelector('img')).toBeNull();
    expect(
        screen.getByText('Learner context is added at runtime.'),
    ).toBeVisible();

    fireEvent.click(
        screen.getByRole('button', { name: 'Agent: Example agent' }),
    );

    expect(onSelect).toHaveBeenCalledWith({
        kind: 'agent',
        id: 'example-agent',
    });

    expect(
        screen.queryByRole('button', {
            name: /save|execute|generate|delete|edit/i,
        }),
    ).toBeNull();
});

it('distinguishes development tool references that share an application runtime name', () => {
    const application: AdminAiCatalogSummary = {
        ...related,
        kind: 'tool',
        id: 'generate_example',
        name: 'generate_example',
    };
    const development: AdminAiCatalogSummary = {
        ...application,
        id: 'playground.generate_example',
        scope: 'development',
    };
    const onSelect = vi.fn();
    render(
        <CatalogEntryDetail
            entry={{
                ...prompt,
                references: [application, development].map(({ kind, id }) => ({
                    kind,
                    id,
                })),
            }}
            entries={[application, development]}
            onSelect={onSelect}
        />,
    );

    expect(
        screen.getByRole('button', {
            name: 'Tool: generate_example',
        }),
    ).toBeVisible();

    fireEvent.click(
        screen.getByRole('button', { name: /playground.generate_example/ }),
    );

    expect(onSelect).toHaveBeenCalledWith({ kind: 'tool', id: development.id });
});

it('distinguishes an undeclared schema from a declared empty object and preserves hostile-looking strings as JSON', () => {
    const tool: AdminAiCatalogEntry = {
        ...related,
        kind: 'tool',
        limitations: [],
        inputSchema: {},
        outputSchema: {
            description: '<script>unsafe()</script>',
            type: 'object',
        },
        requestContextSchema: null,
    };
    const { container } = render(
        <CatalogEntryDetail entry={tool} entries={[]} onSelect={vi.fn()} />,
    );

    expect(
        screen.getByLabelText('Input schema', { selector: 'pre' }).textContent,
    ).toBe('{}');

    const output = screen.getByLabelText('Output schema', { selector: 'pre' });
    expect(output.textContent).toContain('<script>unsafe()</script>');
    expect(container.querySelector('script')).toBeNull();
    const context = screen
        .getByText('Request context schema', { selector: 'summary' })
        .closest('details')!;

    expect(
        within(context).getByText('No schema is declared for this boundary.'),
    ).toBeInTheDocument();
});
