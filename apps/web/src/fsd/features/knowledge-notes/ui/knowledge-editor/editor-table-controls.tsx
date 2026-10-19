import type { Editor } from '@tiptap/react';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import styles from './knowledge-editor.module.css';

export function EditorTableControls({
    editor,
    disabled,
}: {
    editor: Editor;
    disabled: boolean;
}) {
    const { t } = useI18n();
    function addRow() {
        editor.chain().focus().addRowAfter().run();
    }
    function addColumn() {
        editor.chain().focus().addColumnAfter().run();
    }
    function deleteRow() {
        editor.chain().focus().deleteRow().run();
    }
    function deleteColumn() {
        editor.chain().focus().deleteColumn().run();
    }
    function deleteTable() {
        editor.chain().focus().deleteTable().run();
    }
    if (!editor.isActive('table')) return null;
    return (
        <div
            className={styles.tableTools}
            role='group'
            aria-label={t('knowledge.table')}
        >
            <Button
                type='button'
                size='compact'
                variant='ghost'
                disabled={disabled}
                onClick={addRow}
            >
                {t('knowledge.addRow')}
            </Button>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                disabled={disabled}
                onClick={addColumn}
            >
                {t('knowledge.addColumn')}
            </Button>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                disabled={disabled}
                onClick={deleteRow}
            >
                {t('knowledge.deleteRow')}
            </Button>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                disabled={disabled}
                onClick={deleteColumn}
            >
                {t('knowledge.deleteColumn')}
            </Button>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                disabled={disabled}
                onClick={deleteTable}
            >
                {t('knowledge.deleteTable')}
            </Button>
        </div>
    );
}
