import { useState } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TextDocument } from '@languon/contracts';
import { textsApi } from '@/fsd/entities/texts';
import type { TextWorkspace } from '@/fsd/pages/texts/hooks/use-text-workspace';
import { useTextWorkspaceSave } from '@/fsd/pages/texts/hooks/use-text-workspace-save';
import { WorkspaceCompose } from '@/fsd/pages/texts/ui/workspace-page/workspace-compose';
import { WorkspaceLanguages } from '@/fsd/pages/texts/ui/workspace-page/workspace-languages';
import { WorkspacePairEditor } from '@/fsd/pages/texts/ui/workspace-page/workspace-pair-editor';
import { WorkspaceBanners } from '@/fsd/pages/texts/ui/workspace-page/workspace-banners';
import { render } from './render';
const id = '123e4567-e89b-42d3-a456-426614174000';
const input = {
    title: 'Title',
    sourceText: 'A sentence.',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
};
const pairs = [
    { pairId: id, source: 'A sentence.', translation: 'Une phrase.' },
];
const document = {
    ...input,
    id,
    folderId: id,
    version: 1,
    alignment: {
        source: [{ pairId: id, text: input.sourceText }],
        translation: [{ pairId: id, text: pairs[0]!.translation }],
        editedPairIds: [],
    },
} as unknown as TextDocument;
function stubWorkspace(overrides: Partial<TextWorkspace> = {}): TextWorkspace {
    return {
        input,
        pairs,
        document,
        mode: 'compose',
        touched: new Set(),
        setInput: vi.fn(),
        editPair: vi.fn(),
        showErrors: false,
        saving: false,
        saveError: null,
        languages: { data: { languages: [] } },
        translation: {
            active: false,
            pending: false,
            job: null,
            error: null,
            clear: vi.fn(),
        },
        detection: { active: false, job: null, error: null },
        detectionResult: null,
        shortenSource: vi.fn(),
        translate: vi.fn(),
        ...overrides,
    } as unknown as TextWorkspace;
}
describe('workspace pending-save controls and failed-job recovery', () => {
    it('locks all editable fields throughout a delayed save, preserving the submitted snapshot', async () => {
        let resolve!: (value: { text: TextDocument }) => void;
        const save = vi.spyOn(textsApi, 'saveText').mockReturnValue(
            new Promise((done) => {
                resolve = done;
            }),
        );
        const setInput = vi.fn();
        const editPair = vi.fn();
        const adopt = vi.fn();
        function Harness() {
            const state = useTextWorkspaceSave({
                request: (operation) => operation('token'),
                folderId: id,
                document,
                input,
                mode: 'edit',
                pairs,
                proposal: null,
                previewExpired: false,
                conflict: null,
                setShowErrors: vi.fn(),
                setExpired: vi.fn(),
                setConflict: vi.fn(),
                setDocument: vi.fn(),
                adopt,
                clearProposal: vi.fn(),
            });
            const ws = stubWorkspace({
                saving: state.saving,
                setInput,
                editPair,
            });
            return (
                <>
                    <button onClick={() => void state.save()}>
                        Start save
                    </button>
                    <WorkspaceCompose ws={ws} />
                    <WorkspaceLanguages
                        ws={ws}
                        match={false}
                        onMatch={vi.fn()}
                    />
                    <WorkspacePairEditor ws={ws} />
                </>
            );
        }
        const view = render(<Harness />);
        fireEvent.click(screen.getByText('Start save'));
        expect(screen.getByLabelText('Title')).toBeDisabled();
        for (const field of view.container.querySelectorAll('textarea,select'))
            expect(field).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Detect language' }),
        ).toBeDisabled();
        expect(setInput).not.toHaveBeenCalled();
        expect(editPair).not.toHaveBeenCalled();
        await act(async () => {
            resolve({ text: document });
        });
        expect(screen.getByLabelText('Title')).toBeEnabled();
        expect(adopt).toHaveBeenCalledWith(document);
        expect(save).toHaveBeenCalledTimes(1);
        view.unmount();
        vi.restoreAllMocks();
    });
    it('offers error dismissal and capacity shortening without changing saved text', () => {
        const clear = vi.fn();
        const shortenSource = vi.fn();
        const ws = stubWorkspace({
            translation: {
                job: {
                    state: 'failed',
                    failureCode: 'model_capacity_exceeded',
                },
                active: false,
                pending: false,
                error: null,
                clear,
            } as unknown as TextWorkspace['translation'],
            shortenSource,
        });
        render(<WorkspaceBanners ws={ws} />);
        fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }));
        expect(clear).toHaveBeenCalledOnce();
        fireEvent.click(
            screen.getByRole('button', { name: 'Shorten the text' }),
        );
        expect(shortenSource).toHaveBeenCalledOnce();
        expect(ws.document?.sourceText).toBe(input.sourceText);
    });
    it('switches the compact composer back to Source before shortening a failed translation', () => {
        const shortenSource = vi.fn();
        const running = stubWorkspace({
            shortenSource,
            translation: {
                active: true,
                pending: false,
                job: { state: 'running' },
                error: null,
            } as unknown as TextWorkspace['translation'],
        });
        let setWorkspace!: (ws: TextWorkspace) => void;
        function ComposerHarness() {
            const [ws, setWs] = useState(running);
            setWorkspace = setWs;
            return <WorkspaceCompose ws={ws} />;
        }
        const view = render(<ComposerHarness />);
        expect(
            screen.getByRole('tab', { name: 'Translation' }),
        ).toHaveAttribute('aria-selected', 'true');
        const failed = stubWorkspace({
            shortenSource,
            translation: {
                active: false,
                pending: false,
                job: {
                    state: 'failed',
                    failureCode: 'model_capacity_exceeded',
                },
                error: null,
                clear: vi.fn(),
            } as unknown as TextWorkspace['translation'],
        });
        act(() => setWorkspace(failed));
        expect(
            screen.getByRole('tab', { name: 'Translation' }),
        ).toHaveAttribute('aria-selected', 'true');
        fireEvent.click(
            screen.getByRole('button', { name: 'Shorten the text' }),
        );
        expect(
            screen.getByRole('tab', { name: 'Source text' }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(view.container.querySelector('[data-tab]')).toHaveAttribute(
            'data-tab',
            'source',
        );
        expect(shortenSource).toHaveBeenCalledOnce();
    });
});
