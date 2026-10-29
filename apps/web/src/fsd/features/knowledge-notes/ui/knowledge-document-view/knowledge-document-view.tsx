'use client';

import type { ComponentProps, ReactNode } from 'react';
import { KnowledgeBodySchema, type LearningBlock } from '@languon/contracts';
import { KnowledgeBody } from '@/fsd/entities/knowledge';
import type { LearningBlockViewProps } from '@/fsd/entities/learning-blocks';
import type { MenuItem } from '@/fsd/shared/ui';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { knowledgeDocumentGroups } from '../../lib/knowledge-document-groups';
import {
    ReaderLearningBlock,
    type KnowledgeReadingBlockOverrides,
} from './reader-learning-block';

export function KnowledgeDocumentView({
    blockOptions,
    library,
    blockCopy,
    getBlockActions,
    renderBlockMenu,
    renderBlockContent,
    wrapBlock,
    ...props
}: Omit<ComponentProps<typeof KnowledgeBody>, 'renderLearningBlock'> & {
    library?: KnowledgeLibraryContext | undefined;
    blockCopy?: KnowledgeBlockCopyContext | undefined;
    blockOptions?:
        | ((
              block: LearningBlock,
          ) => Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'>)
        | undefined;
    getBlockActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
    renderBlockMenu?:
        ((block: LearningBlock, items: MenuItem[]) => ReactNode) | undefined;
    wrapBlock?:
        | ((
              block: LearningBlock,
              render: (overrides?: KnowledgeReadingBlockOverrides) => ReactNode,
          ) => ReactNode)
        | undefined;
    renderBlockContent?:
        | ((
              block: LearningBlock,
              options: Omit<
                  Partial<LearningBlockViewProps>,
                  'block' | 'labels'
              >,
          ) => ReactNode)
        | undefined;
}) {
    const plan = knowledgeDocumentGroups(KnowledgeBodySchema.parse(props.body));
    function renderBlock(block: LearningBlock) {
        return (
            <ReaderLearningBlock
                key={block.id}
                block={block}
                allBlocks={plan.blocks}
                group={plan.groups.get(block.id)}
                linked={plan.linked.get(block.id)}
                library={library}
                blockCopy={blockCopy}
                blockOptions={blockOptions}
                getBlockActions={getBlockActions}
                renderBlockMenu={renderBlockMenu}
                renderBlockContent={renderBlockContent}
                wrapBlock={wrapBlock}
            />
        );
    }
    return (
        <KnowledgeBody
            {...props}
            body={plan.body}
            renderLearningBlock={renderBlock}
        />
    );
}
