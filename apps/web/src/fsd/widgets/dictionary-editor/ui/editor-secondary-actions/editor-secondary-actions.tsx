import { Menu } from '@/fsd/shared/ui';
import { MoreHorizontal } from 'lucide-react';
import type { EditorViewFields } from '../../lib/editor-workspace';
import {
    syncBatchGenerationUrl,
    syncDocumentGenerationUrl,
} from '../../lib/generation-url';

export function EditorSecondaryActions({
    model,
}: {
    model: Pick<
        EditorViewFields,
        | 't'
        | 'current'
        | 'generationCapabilities'
        | 'setSharingOpen'
        | 'setInterchangePreview'
        | 'interchangePreviewAction'
        | 'interchangeImportAction'
        | 'interchangeExportAction'
        | 'setInterchangeOpen'
        | 'setBatchGenerationJobId'
        | 'setBatchGenerationOpen'
        | 'batchGenerationAction'
        | 'setDocumentGenerationJobId'
        | 'setDocumentGenerationOpen'
        | 'documentGenerationAction'
    >;
}) {
    const {
        t,
        current,
        generationCapabilities,
        setSharingOpen,
        setInterchangePreview,
        interchangePreviewAction,
        interchangeImportAction,
        interchangeExportAction,
        setInterchangeOpen,
        setBatchGenerationJobId,
        setBatchGenerationOpen,
        batchGenerationAction,
        setDocumentGenerationJobId,
        setDocumentGenerationOpen,
        documentGenerationAction,
    } = model;

    const archived = current.lifecycle === 'archived';

    const label = t('dictionary.editor.actions');

    function openSharing() {
        setSharingOpen(true);
    }

    function openImport() {
        setInterchangePreview(null);
        interchangePreviewAction.reset();
        interchangeImportAction.reset();
        setInterchangeOpen('import');
    }

    function openExport() {
        interchangeExportAction.reset();
        setInterchangeOpen('export');
    }

    function openBatch() {
        setBatchGenerationJobId(null);
        setBatchGenerationOpen(true);
        syncBatchGenerationUrl(null);
        batchGenerationAction.reset();
    }

    function openDocument() {
        setDocumentGenerationJobId(null);
        setDocumentGenerationOpen(true);
        syncDocumentGenerationUrl(null);
        documentGenerationAction.reset();
    }

    const items = [
        {
            label: t('dictionary.batch.open'),
            onSelect: openBatch,
            disabled:
                archived ||
                batchGenerationAction.isPending ||
                generationCapabilities.data?.pastedTermsGeneration.available !==
                    true,
        },
        {
            label: t('dictionary.document.open'),
            onSelect: openDocument,
            disabled:
                archived ||
                documentGenerationAction.isPending ||
                generationCapabilities.data?.documentTermsGeneration
                    .available !== true,
        },
        {
            label: t('dictionary.interchange.openImport'),
            onSelect: openImport,
            disabled: archived || interchangeImportAction.isPending,
        },
        {
            label: t('dictionary.interchange.openExport'),
            onSelect: openExport,
            disabled:
                archived ||
                interchangeExportAction.isPending ||
                current.activeCardCount === 0,
        },
        {
            label: t('dictionary.editor.sharing'),
            onSelect: openSharing,
            disabled: archived,
        },
    ];

    return (
        <Menu
            iconOnly
            label={label}
            trigger={<MoreHorizontal size={18} aria-hidden />}
            items={items}
        />
    );
}
