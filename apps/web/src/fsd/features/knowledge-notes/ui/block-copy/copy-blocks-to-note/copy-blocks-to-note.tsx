'use client';
import { useState } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import type { KnowledgeBlockCopyContext } from '../../../api/block-copy-api';
import { blockCopyLabels } from '../block-copy-labels';
import { BlockCopyDialog } from './ui/block-copy-dialog/block-copy-dialog';
export function CopyBlocksToNote({
    context,
    compact = false,
    blocks,
    disabled = false,
}: {
    compact?: boolean;
    context: KnowledgeBlockCopyContext;
    blocks: LearningBlock[];
    disabled?: boolean;
}) {
    const { locale } = useI18n();
    const labels = blockCopyLabels(locale);
    const [open, setOpen] = useState(false);
    function show() {
        setOpen(true);
    }

    function close() {
        setOpen(false);
    }

    return (
        <>
            <Button
                type='button'
                variant={compact ? 'ghost' : 'secondary'}
                size={compact ? 'small' : 'default'}
                onClick={show}
                disabled={disabled || blocks.length === 0}
            >
                {labels.title}
            </Button>
            {open && (
                <BlockCopyDialog
                    context={context}
                    blocks={blocks}
                    onClose={close}
                />
            )}
        </>
    );
}
