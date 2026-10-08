import { Menu } from '@/fsd/shared/ui';
import {
    BookOpen,
    ClipboardPaste,
    Download,
    FileText,
    MessageSquareText,
    MoreHorizontal,
    Share2,
    Upload,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
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
        | 'href'
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
        href,
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
    const router = useRouter();

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
            label: t('dictionary.editor.savedSentences'),
            icon: <MessageSquareText aria-hidden className='h-4 w-4' />,
            onSelect: () =>
                router.push(href(`/dictionaries/${current.id}/sentences`)),
        },
        {
            label: t('dictionary.editor.practiceHistory'),
            icon: <BookOpen aria-hidden className='h-4 w-4' />,
            disabled: archived,
            onSelect: () =>
                router.push(
                    href(`/dictionaries/${current.id}?practice=history`),
                ),
        },
        {
            label: t('dictionary.batch.open'),
            icon: <ClipboardPaste aria-hidden className='h-4 w-4' />,
            separatorBefore: true,
            headingBefore: t('dictionary.editor.bulkAndSharing'),
            onSelect: openBatch,
            disabled:
                archived ||
                batchGenerationAction.isPending ||
                generationCapabilities.data?.pastedTermsGeneration.available !==
                    true,
        },
        {
            label: t('dictionary.document.open'),
            icon: <FileText aria-hidden className='h-4 w-4' />,
            onSelect: openDocument,
            disabled:
                archived ||
                documentGenerationAction.isPending ||
                generationCapabilities.data?.documentTermsGeneration
                    .available !== true,
        },
        {
            label: t('dictionary.interchange.openImport'),
            icon: <Upload aria-hidden className='h-4 w-4' />,
            onSelect: openImport,
            disabled: archived || interchangeImportAction.isPending,
        },
        {
            label: t('dictionary.interchange.openExport'),
            icon: <Download aria-hidden className='h-4 w-4' />,
            separatorBefore: true,
            onSelect: openExport,
            disabled:
                archived ||
                interchangeExportAction.isPending ||
                current.activeCardCount === 0,
        },
        {
            label: t('dictionary.editor.sharing'),
            icon: <Share2 aria-hidden className='h-4 w-4' />,
            onSelect: openSharing,
            disabled: archived,
        },
    ];

    return (
        <Menu
            iconOnly
            triggerClassName='!h-10 !w-10 !min-h-10 border border-border-strong bg-background-surface text-text-primary'
            menuClassName='bg-background-elevated text-text-primary border-border-default'
            label={label}
            trigger={<MoreHorizontal size={18} aria-hidden />}
            items={items}
        />
    );
}
