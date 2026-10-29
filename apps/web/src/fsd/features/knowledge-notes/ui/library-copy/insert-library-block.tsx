'use client';
import { useState } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { libraryLabels } from './library-labels';
import { InsertDialog } from './insert-library-dialog';

export function InsertLibraryBlock({
    context,
    compact = false,
    disabled,
    onInsert,
}: {
    compact?: boolean;
    context: KnowledgeLibraryContext;
    disabled: boolean;
    onInsert(block: LearningBlock): boolean;
}) {
    const { locale } = useI18n();
    const labels = libraryLabels(locale);
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
                disabled={disabled}
                onClick={show}
            >
                {labels.insert}
            </Button>
            {open && (
                <InsertDialog
                    context={context}
                    labels={labels}
                    onClose={close}
                    onInsert={onInsert}
                    disabled={disabled}
                />
            )}
        </>
    );
}
