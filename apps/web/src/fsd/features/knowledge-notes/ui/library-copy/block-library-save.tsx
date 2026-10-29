'use client';
import { useState } from 'react';
import { Button } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { libraryLabels } from './library-labels';
import { LibrarySaveDialog } from './library-save-dialog';
import type { LibraryContentBlock } from '../../types';
export function BlockLibrarySave({
    block,
    context,
}: {
    block: LibraryContentBlock;
    context: KnowledgeLibraryContext;
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
    const title =
        block.type === 'vocabulary' ? labels.saveVocabulary : labels.saveText;
    return (
        <>
            <Button type='button' variant='secondary' onClick={show}>
                {title}
            </Button>
            {open && (
                <LibrarySaveDialog
                    block={block}
                    context={context}
                    labels={labels}
                    onClose={close}
                />
            )}
        </>
    );
}
