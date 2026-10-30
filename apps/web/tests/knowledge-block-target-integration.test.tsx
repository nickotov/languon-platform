import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useKnowledgeLearningIntegrations } from '../src/fsd/pages/knowledge/hooks/use-knowledge-learning-integrations';
import type { useKnowledgePageActions } from '../src/fsd/pages/knowledge/hooks/use-knowledge-page-actions';
vi.mock('../src/fsd/features/auth', () => ({
    useAuth: () => ({ requestWithSession: vi.fn() }),
}));
vi.mock('../src/fsd/entities/session', () => ({
    useSessionStore: (select: (state: unknown) => unknown) =>
        select({ user: { id: 'owner' } }),
}));
vi.mock('../src/fsd/widgets/knowledge-speech', () => ({
    useKnowledgeBlockPlayback: () => ({ options: vi.fn(), confirmation: null }),
}));
vi.mock('../src/fsd/features/workbook-learning', () => ({
    useNoteAudio: () => ({}),
    exerciseSource: () => ({}),
}));
vi.mock('../src/fsd/pages/knowledge/hooks/use-owned-block-practice', () => ({
    useOwnedBlockPractice: () => ({ options: () => ({}), consent: null }),
}));
const blockId = '11111111-1111-4111-8111-111111111111';
function actions(title: string, include = true) {
    return {
        busy: null,
        state: { reload: vi.fn(), flush: vi.fn() },
        editor: { current: null },
        setProposalApplying: vi.fn(),
        workspace: { published: null },
        draft: {
            branchId: 'branch',
            version: 1,
            content: {
                studiedLanguage: 'en',
                body: {
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: include
                            ? [
                                  {
                                      type: 'learningBlock',
                                      attrs: {
                                          block: {
                                              id: blockId,
                                              type: 'grammar',
                                              language: 'en',
                                              title,
                                              rule: 'Prepared material',
                                          },
                                      },
                                  },
                              ]
                            : [],
                    },
                },
            },
        },
    } as unknown as ReturnType<typeof useKnowledgePageActions>;
}
it('exposes current authorized draft labels through the actual proposal integration context', () => {
    const { result, rerender } = renderHook(
        ({ model }) => useKnowledgeLearningIntegrations('note', model),
        { initialProps: { model: actions('Original target') } },
    );
    expect(result.current.blockProposalContext?.getBlockLabel(blockId)).toBe(
        'Original target',
    );
    rerender({ model: actions('Renamed target') });
    expect(result.current.blockProposalContext?.getBlockLabel(blockId)).toBe(
        'Renamed target',
    );
    rerender({ model: actions('Deleted', false) });
    expect(
        result.current.blockProposalContext?.getBlockLabel(blockId),
    ).toBeUndefined();
    expect(
        result.current.blockProposalContext?.getBlockLabel('foreign-id'),
    ).toBeUndefined();
});
