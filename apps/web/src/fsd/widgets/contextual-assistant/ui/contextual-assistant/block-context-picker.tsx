import { useState, type ReactNode } from 'react';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import { BlockReferencePicker } from './block-reference-controls';
import { blockReferenceCopy } from '../../lib/block-reference-copy';

export function BlockContextPicker({
    available,
    selected,
    onAdd,
    onRemove,
    onClose,
    libraryPicker,
}: {
    available: KnowledgeBlockReference[];
    selected: KnowledgeBlockReference[];
    onAdd(id: string): void;
    onRemove(id: string): void;
    onClose(): void;
    libraryPicker: ReactNode;
}) {
    const [texts, setTexts] = useState(false);
    const { locale } = useI18n();
    function showTexts() {
        setTexts(true);
    }
    function showBlocks() {
        setTexts(false);
    }
    if (texts)
        return (
            <div>
                <Button variant='ghost' size='compact' onClick={showBlocks}>
                    {blockReferenceCopy(locale).blocks}
                </Button>
                {libraryPicker}
            </div>
        );
    return (
        <BlockReferencePicker
            available={available}
            selected={selected}
            onAdd={onAdd}
            onRemove={onRemove}
            onClose={onClose}
            onTexts={showTexts}
        />
    );
}
