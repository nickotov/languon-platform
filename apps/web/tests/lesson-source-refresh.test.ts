import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureGenerationSource } from '../src/fsd/widgets/contextual-assistant/lib/capture-generation-source';
import type {
    WorkspaceAssistantProps,
    WorkspaceEditorSnapshot,
} from '../src/fsd/widgets/contextual-assistant/types';

const id = '11111111-1111-4111-8111-111111111111';
const snapshot: WorkspaceEditorSnapshot = {
    content: 'Before. Current passage. After.',
    selectedPassage: 'Current passage.',
    targetId: id,
    editorTarget: { from: 8, to: 24, originalText: 'Current passage.' },
};

function workspace(): WorkspaceAssistantProps {
    return {
        getSnapshot: vi.fn(() => snapshot),
        beforeSend: vi.fn(async () => ({ id, version: 3 })),
        onAcceptProposal: vi.fn(() => 'applied'),
    };
}

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

it('captures the actual current selection, flushes the branch and sends its exact range and content hash', async () => {
    const host = workspace();
    const result = await captureGenerationSource(host);
    expect(host.getSnapshot).toHaveBeenNthCalledWith(1);
    expect(host.beforeSend).toHaveBeenCalledOnce();
    expect(host.getSnapshot).toHaveBeenNthCalledWith(2, id);
    expect(result).toEqual({
        content: snapshot.content,
        selectedText: snapshot.editorTarget.originalText,
        workingBranch: { id, version: 3 },
        editorTarget: {
            ...snapshot.editorTarget,
            documentHash: createHash('sha256')
                .update(snapshot.content)
                .digest('hex'),
        },
    });
});

it('never invents a source selection from the whole document or an empty caret', async () => {
    const host = workspace();
    host.getSnapshot = vi.fn(() => ({
        ...snapshot,
        selectedPassage: undefined,
        editorTarget: { from: 8, to: 8, originalText: '' },
    }));

    expect(await captureGenerationSource(host)).toBeUndefined();
    expect(host.beforeSend).toHaveBeenCalledOnce();
});

it('rejects a passage changed while saving instead of refreshing against a stale range', async () => {
    const host = workspace();
    host.getSnapshot = vi
        .fn()
        .mockReturnValueOnce(snapshot)
        .mockReturnValueOnce({ ...snapshot, content: 'A changed document.' });

    await expect(captureGenerationSource(host)).rejects.toThrow(
        'selection changed',
    );
});

it('does not authorize a selection without a persisted working-branch version', async () => {
    const host = workspace();
    host.beforeSend = vi.fn(async () => undefined);
    expect(await captureGenerationSource(host)).toBeUndefined();
});
