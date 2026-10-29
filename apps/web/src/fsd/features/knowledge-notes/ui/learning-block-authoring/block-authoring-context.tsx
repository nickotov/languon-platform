'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { LearningBlock } from '@languon/contracts';
import type { LearningBlockViewProps } from '@/fsd/entities/learning-blocks';
import type { KnowledgeBlockFieldAiContext } from '../../api/block-field-ai-api';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import type { LibraryContentBlock } from '../../types';
import type { MenuItem } from '@/fsd/shared/ui';
import type {
    BlockKind,
    BlockLanguageDefaults,
} from '../../lib/learning-block-form';

export type RenderAudioPreparation = (
    block: Extract<LearningBlock, { type: 'audio' }>,
    onAccept: (block: Extract<LearningBlock, { type: 'audio' }>) => void,
) => ReactNode;

export type BlockEditingTarget = {
    kind: BlockKind;
    block?: LearningBlock;
    existing?: boolean;
    members?: LearningBlock[];
};

type BlockAuthoringContextValue = {
    enabled: boolean;
    library?: KnowledgeLibraryContext | undefined;
    libraryBlock: LibraryContentBlock | null;
    setLibraryBlock(block: LibraryContentBlock | null): void;
    renderBlockMenu?:
        ((block: LearningBlock, items: MenuItem[]) => ReactNode) | undefined;
    blockAccents: boolean;
    expansions: Record<string, { open: boolean; at: number }>;
    attempted: Record<string, { identity: string; attempted: boolean }>;
    recordAttempt(id: string, attempted: boolean, identity: string): void;
    toggleExpansion(id: string): void;
    fieldAi?: KnowledgeBlockFieldAiContext | undefined;
    languageDefaults?: BlockLanguageDefaults | undefined;
    renderAudioPreparation?: RenderAudioPreparation | undefined;
    blockViewOptions?:
        | ((
              block: LearningBlock,
          ) => Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'>)
        | undefined;
    canDuplicateOnServer: boolean;
    editing: BlockEditingTarget | null;
    setEditing(value: BlockEditingTarget | null): void;
    copyToAnotherNote: boolean;
    setCopyToAnotherNote(value: boolean): void;
    serverDuplicate: LearningBlock | null;
    serverDuplicateMembers: LearningBlock[];
    setServerDuplicateMembers(value: LearningBlock[]): void;
    setServerDuplicate(value: LearningBlock | null): void;
    additionalActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
};

const BlockAuthoringContext = createContext<BlockAuthoringContextValue | null>(
    null,
);

/** Shares authoring dialogs and extensible actions with editor node views. */
export function BlockAuthoringProvider({
    enabled,
    library,
    renderBlockMenu,
    blockAccents = true,
    fieldAi,
    languageDefaults,
    renderAudioPreparation,
    blockViewOptions,
    canDuplicateOnServer,
    additionalActions,
    children,
}: {
    enabled: boolean;
    library?: KnowledgeLibraryContext | undefined;
    renderBlockMenu?:
        ((block: LearningBlock, items: MenuItem[]) => ReactNode) | undefined;
    blockAccents?: boolean | undefined;
    fieldAi?: KnowledgeBlockFieldAiContext | undefined;
    languageDefaults?: BlockLanguageDefaults | undefined;
    renderAudioPreparation?: RenderAudioPreparation | undefined;
    blockViewOptions?:
        | ((
              block: LearningBlock,
          ) => Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'>)
        | undefined;
    canDuplicateOnServer: boolean;
    additionalActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
    children: ReactNode;
}) {
    const [libraryBlock, setLibraryBlock] =
        useState<LibraryContentBlock | null>(null);
    const [expansions, setExpansions] = useState<
        Record<string, { open: boolean; at: number }>
    >({});
    const [attempted, setAttempted] = useState<
        Record<string, { identity: string; attempted: boolean }>
    >({});
    function recordAttempt(id: string, value: boolean, identity: string) {
        setAttempted((previous) => {
            if (
                previous[id]?.attempted === value &&
                previous[id]?.identity === identity
            )
                return previous;
            return { ...previous, [id]: { attempted: value, identity } };
        });
    }
    function toggleExpansion(id: string) {
        setExpansions((current) => ({
            ...current,
            [id]: { open: !current[id]?.open, at: (current[id]?.at ?? 0) + 1 },
        }));
    }
    const [copyToAnotherNote, setCopyToAnotherNote] = useState(false);
    const [editing, setEditing] = useState<BlockEditingTarget | null>(null);
    const [serverDuplicateMembers, setServerDuplicateMembers] = useState<
        LearningBlock[]
    >([]);
    const [serverDuplicate, setServerDuplicate] =
        useState<LearningBlock | null>(null);
    return (
        <BlockAuthoringContext.Provider
            value={{
                enabled,
                library,
                libraryBlock,
                setLibraryBlock,
                renderBlockMenu,
                blockAccents,
                expansions,
                attempted,
                recordAttempt,
                toggleExpansion,
                fieldAi,
                languageDefaults,
                renderAudioPreparation,
                blockViewOptions,
                canDuplicateOnServer,
                editing,
                setEditing,
                copyToAnotherNote,
                setCopyToAnotherNote,
                serverDuplicate,
                serverDuplicateMembers,
                setServerDuplicateMembers,
                setServerDuplicate,
                additionalActions,
            }}
        >
            {children}
        </BlockAuthoringContext.Provider>
    );
}

export function useBlockAuthoring() {
    return useContext(BlockAuthoringContext);
}
