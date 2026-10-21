import { useState } from 'react';
import type { TextDocument } from '@languon/contracts';
import type { RequestWithTextSession } from '@/fsd/entities/texts';
import {
    ArchiveTextDialog,
    MoveTextDialog,
    RenameTextDialog,
    TextShareDialog,
} from '@/fsd/features/text-management';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useTextFolder } from '../../hooks/use-text-folder';
import { TextRow, type TextRowAction } from '../folder-page/text-row';
import styles from './library-page.module.css';

export function IndependentTexts({
    lifecycle,
    requestWithSession,
}: {
    lifecycle: 'active' | 'archived';
    requestWithSession: RequestWithTextSession;
}) {
    const { t } = useI18n();
    const list = useTextFolder(null, lifecycle, requestWithSession, true);
    const [dialog, setDialog] = useState<{
        type: TextRowAction;
        document: TextDocument;
    } | null>(null);
    function action(type: TextRowAction, document: TextDocument) {
        setDialog({ type, document });
    }
    function close() {
        setDialog(null);
    }
    function saved() {
        close();
        void list.refresh();
    }
    function changed() {
        return list.refresh();
    }
    function restore(document: TextDocument) {
        list.restore.mutate(document);
    }
    function retry() {
        void list.refetch();
    }
    function more() {
        void list.fetchNextPage();
    }
    return (
        <>
            {list.isPending && (
                <p role='status'>{t('texts.workspace.loading')}</p>
            )}
            {list.isError && (
                <InlineAlert
                    tone='error'
                    actions={
                        <Button onClick={retry}>
                            {t('texts.library.retry')}
                        </Button>
                    }
                >
                    {t('texts.library.errorHelp')}
                </InlineAlert>
            )}
            {list.restore.isError && (
                <InlineAlert tone='error'>
                    {t('texts.library.mutationError')}
                </InlineAlert>
            )}
            {list.isSuccess && list.documents.length === 0 && (
                <p className={styles.independentEmpty}>
                    {t('texts.organization.emptyIndependent')}
                </p>
            )}
            <ul className={styles.textRows}>
                {list.documents.map((document) => (
                    <TextRow
                        key={document.id}
                        document={document}
                        readOnly={false}
                        pending={list.restore.isPending}
                        onAction={action}
                        onRestore={restore}
                    />
                ))}
            </ul>
            {list.hasNextPage && (
                <Button onClick={more} loading={list.isFetchingNextPage}>
                    {t('texts.library.more')}
                </Button>
            )}
            {dialog?.type === 'move-text' && (
                <MoveTextDialog
                    document={dialog.document}
                    requestWithSession={requestWithSession}
                    onClose={close}
                    onSaved={saved}
                />
            )}
            {dialog?.type === 'rename' && (
                <RenameTextDialog
                    open
                    document={dialog.document}
                    requestWithSession={requestWithSession}
                    onClose={close}
                    onSaved={saved}
                />
            )}
            {dialog?.type === 'archive-text' && (
                <ArchiveTextDialog
                    open
                    kind='text'
                    resource={dialog.document}
                    requestWithSession={requestWithSession}
                    onClose={close}
                    onSaved={saved}
                />
            )}
            {dialog?.type === 'share-text' && (
                <TextShareDialog
                    open
                    kind='text'
                    resource={dialog.document}
                    requestWithSession={requestWithSession}
                    onClose={close}
                    onChanged={changed}
                />
            )}
        </>
    );
}
