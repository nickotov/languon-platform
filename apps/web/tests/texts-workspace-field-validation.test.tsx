import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TextWorkspace } from '@/fsd/pages/texts/hooks/use-text-workspace';
import {
    workspaceValidation,
    type WorkspaceInput,
} from '@/fsd/pages/texts/lib/workspace-content';
import { WorkspaceLanguages } from '@/fsd/pages/texts/ui/workspace-page/workspace-languages';
import { WorkspaceCompose } from '@/fsd/pages/texts/ui/workspace-page/workspace-compose';
import { WorkspaceActions } from '@/fsd/pages/texts/ui/workspace-page/workspace-actions';
import { render } from './render';

const initial: WorkspaceInput = {
    title: '',
    sourceLanguage: 'auto',
    targetLanguage: '',
    sourceText: 'A sentence.',
};

function Harness({ value = initial }: { value?: WorkspaceInput }) {
    const [input, setInput] = useState(value);
    const ws = {
        input,
        setInput,
        mode: 'compose',
        saving: false,
        showErrors: true,
        translation: { active: false, pending: false, job: null, error: null },
        detection: { active: false, job: null, error: null },
        languages: {
            data: {
                languages: [
                    { tag: 'en', displayNames: { en: 'English' } },
                    { tag: 'fr', displayNames: { en: 'French' } },
                ],
            },
        },
        translate: vi.fn(),
    } as unknown as TextWorkspace;

    return (
        <>
            <WorkspaceLanguages ws={ws} match={false} onMatch={vi.fn()} />
            <WorkspaceCompose ws={ws} />
            <WorkspaceActions
                ws={ws}
                onDiscard={vi.fn()}
                onCancelEdit={vi.fn()}
            />
        </>
    );
}

describe('workspace field-specific validation', () => {
    it('clears the target error immediately when a translation language is selected', () => {
        render(<Harness />);
        const target = screen.getByLabelText('Translation language');
        expect(target).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Choose a translation language.',
        );
        expect(screen.getByLabelText('Source text')).not.toHaveAttribute(
            'aria-invalid',
            'true',
        );

        fireEvent.change(target, { target: { value: 'fr' } });
        expect(target).not.toHaveAttribute('aria-invalid', 'true');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps errors local and clears an oversized textarea when reduced to the Unicode limit', () => {
        render(
            <Harness value={{ ...initial, sourceText: '😀'.repeat(20_001) }} />,
        );
        const text = screen.getByLabelText('Source text');
        expect(text).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText(/^The text is too long/)).toBeVisible();

        fireEvent.change(text, { target: { value: '😀'.repeat(20_000) } });
        expect(text).not.toHaveAttribute('aria-invalid', 'true');
        expect(
            screen.queryByText(/^The text is too long/),
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText('Translation language')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
    });

    it('renders one compose Translate beside the count and omits the removed draft hint', () => {
        render(<Harness />);
        const button = screen.getByRole('button', { name: 'Translate via AI' });
        expect(button.closest('section')).toContainElement(
            screen.getByLabelText('Source text'),
        );
        expect(button.closest('div')?.parentElement).toHaveTextContent(
            '20,000',
        );
        expect(
            screen.queryByText(/To save a draft without translating/),
        ).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Source text'), {
            target: { value: '' },
        });
        expect(
            screen.queryByRole('button', { name: 'Translate via AI' }),
        ).not.toBeInTheDocument();
    });

    it('distinguishes empty text, missing source, same languages, and excessive length', () => {
        expect(
            workspaceValidation({
                ...initial,
                sourceLanguage: '',
                sourceText: '',
            }),
        ).toEqual({
            sourceLanguage: 'sourceRequired',
            targetLanguage: 'targetRequired',
            sourceText: 'textRequired',
        });
        expect(
            workspaceValidation({
                ...initial,
                sourceLanguage: 'fr',
                targetLanguage: 'fr',
            }),
        ).toEqual({
            targetLanguage: 'sameLanguages',
        });
    });
});
