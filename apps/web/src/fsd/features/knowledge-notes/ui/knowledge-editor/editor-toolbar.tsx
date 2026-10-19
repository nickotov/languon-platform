'use client';

import type { Editor } from '@tiptap/react';
import { useI18n } from '@/fsd/shared/i18n';
import { useKnowledgeEditorToolbar } from '../../hooks/use-knowledge-editor-toolbar';
import { Button, Dialog, DialogActions, Input, Select } from '@/fsd/shared/ui';
import styles from './knowledge-editor.module.css';
import { EditorTableControls } from './editor-table-controls';

export function EditorToolbar({
    editor,
    disabled,
    variant = 'full',
}: {
    editor: Editor;
    disabled: boolean;
    variant?: 'full' | 'tutor';
}) {
    const { t } = useI18n();
    const toolbar = useKnowledgeEditorToolbar(editor);
    const full = variant === 'full';
    const iconSize = full ? 18 : 14;
    const tutorControls = new Set([
        'knowledge.bold',
        'knowledge.italic',
        'knowledge.bulletList',
        'knowledge.blockquote',
    ]);
    const controls = full
        ? toolbar.controls
        : toolbar.controls.filter((control) => tutorControls.has(control.key));
    function preserveSelection(event: React.MouseEvent) {
        event.preventDefault();
    }
    return (
        <>
            <div
                className={styles.toolbar}
                role='group'
                aria-label={t('knowledge.explanation')}
            >
                {full && (
                    <Select
                        aria-label={t('knowledge.paragraph')}
                        size='sm'
                        disabled={disabled}
                        value={toolbar.paragraph}
                        onChange={toolbar.changeParagraph}
                        options={[
                            {
                                value: 'paragraph',
                                label: t('knowledge.paragraph'),
                            },
                            { value: '2', label: t('knowledge.heading2') },
                            { value: '3', label: t('knowledge.heading3') },
                        ]}
                    />
                )}
                {controls.map(
                    ({ key, icon: Icon, action, active, unavailable }) => (
                        <button
                            key={key}
                            type='button'
                            className={styles.tool}
                            aria-label={t(key)}
                            title={t(key)}
                            aria-pressed={active}
                            disabled={disabled || unavailable}
                            onMouseDown={preserveSelection}
                            onClick={action}
                        >
                            <Icon aria-hidden size={iconSize} />
                        </button>
                    ),
                )}
            </div>
            {full && (
                <EditorTableControls editor={editor} disabled={disabled} />
            )}
            <Dialog
                open={toolbar.linkOpen}
                onClose={toolbar.closeLink}
                title={t('knowledge.link')}
                closeLabel={t('knowledge.cancel')}
                footer={
                    <DialogActions>
                        <Button
                            type='button'
                            variant='ghost'
                            onClick={toolbar.removeLink}
                        >
                            {t('knowledge.removeLink')}
                        </Button>
                        <Button type='button' onClick={toolbar.applyLink}>
                            {t('knowledge.applyLink')}
                        </Button>
                    </DialogActions>
                }
            >
                <Input
                    label={t('knowledge.linkUrl')}
                    value={toolbar.link}
                    {...(toolbar.linkError
                        ? { error: t('knowledge.unsafeLink') }
                        : {})}
                    type='url'
                    onChange={toolbar.changeLink}
                />
            </Dialog>
        </>
    );
}
