'use client';

import type { ComponentProps } from 'react';
import { KnowledgeBody } from '@/fsd/entities/knowledge';
import {
    LearningBlockView,
    type LearningBlockViewProps,
} from '@/fsd/entities/learning-blocks';
import type { LearningBlock } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import { CopyBlocksToNote } from '../block-copy/copy-blocks-to-note';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { BlockLibrarySave } from '../library-copy/block-library-save';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';

export function KnowledgeDocumentView({
    blockOptions,
    library,
    blockCopy,
    ...props
}: Omit<ComponentProps<typeof KnowledgeBody>, 'renderLearningBlock'> & {
    library?: KnowledgeLibraryContext | undefined;
    blockCopy?: KnowledgeBlockCopyContext | undefined;
    blockOptions?:
        | ((
              block: LearningBlock,
          ) => Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'>)
        | undefined;
}) {
    const { locale } = useI18n();
    const labels = localizedBlockLabels(locale);
    function renderBlock(block: LearningBlock) {
        const options = blockOptions?.(block);
        const canSave =
            block.type === 'vocabulary' || block.type === 'bilingual-text';
        return (
            <>
                <LearningBlockView
                    {...options}
                    block={block}
                    labels={labels.view}
                />
                {library && canSave && (
                    <BlockLibrarySave
                        block={
                            block as Extract<
                                LearningBlock,
                                { type: 'vocabulary' | 'bilingual-text' }
                            >
                        }
                        context={library}
                    />
                )}
            </>
        );
    }
    const blocks = (props.body.document.content ?? []).flatMap((node) =>
        node.type === 'learningBlock' && node.attrs?.block
            ? [node.attrs.block]
            : [],
    );
    return (
        <>
            {blockCopy && (
                <CopyBlocksToNote context={blockCopy} blocks={blocks} />
            )}
            <KnowledgeBody {...props} renderLearningBlock={renderBlock} />
        </>
    );
}
