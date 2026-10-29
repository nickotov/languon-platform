'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { LearningBlock } from '@languon/contracts';
import type { MenuItem } from '@/fsd/shared/ui';
import type { BlockKind } from '../../lib/learning-block-form';

export type BlockEditingTarget = {
    kind: BlockKind;
    block?: LearningBlock;
    existing?: boolean;
};

type BlockAuthoringContextValue = {
    enabled: boolean;
    canDuplicateOnServer: boolean;
    editing: BlockEditingTarget | null;
    setEditing(value: BlockEditingTarget | null): void;
    copyToAnotherNote: boolean;
    setCopyToAnotherNote(value: boolean): void;
    serverDuplicate: LearningBlock | null;
    setServerDuplicate(value: LearningBlock | null): void;
    additionalActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
};

const BlockAuthoringContext = createContext<BlockAuthoringContextValue | null>(
    null,
);

/** Shares authoring dialogs and extensible actions with editor node views. */
export function BlockAuthoringProvider({
    enabled,
    canDuplicateOnServer,
    additionalActions,
    children,
}: {
    enabled: boolean;
    canDuplicateOnServer: boolean;
    additionalActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
    children: ReactNode;
}) {
    const [copyToAnotherNote, setCopyToAnotherNote] = useState(false);
    const [editing, setEditing] = useState<BlockEditingTarget | null>(null);
    const [serverDuplicate, setServerDuplicate] =
        useState<LearningBlock | null>(null);
    return (
        <BlockAuthoringContext.Provider
            value={{
                enabled,
                canDuplicateOnServer,
                editing,
                setEditing,
                copyToAnotherNote,
                setCopyToAnotherNote,
                serverDuplicate,
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
