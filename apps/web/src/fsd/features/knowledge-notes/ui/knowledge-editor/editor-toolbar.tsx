'use client';

import { Ellipsis } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import { useI18n } from '@/fsd/shared/i18n';
import { useKnowledgeEditorToolbar } from '../../hooks/use-knowledge-editor-toolbar';
import {
    Button,
    Dialog,
    DialogActions,
    Input,
    Select,
    Popover,
    PopoverTrigger,
    PopoverContent,
} from '@/fsd/shared/ui';
import styles from './knowledge-editor.module.css';
import { EditorTableControls } from './editor-table-controls';

export function EditorToolbar({
    editor,
    disabled,
    variant = 'full',
    label,
}: {
    editor: Editor;
    disabled: boolean;
    variant?: 'full' | 'tutor' | 'workspace';
    label?: string | undefined;
}) {
    const { t } = useI18n();
    const toolbar = useKnowledgeEditorToolbar(editor);
    const workspace = variant === 'workspace';
    const full = variant !== 'tutor';
    let iconSize = 18;
    if (workspace) iconSize = 16;
    if (!full) iconSize = 14;

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
                className={workspace ? styles.workspaceToolbar : styles.toolbar}
                role='group'
                aria-label={label ?? t('knowledge.explanation')}
            >
                {full && (
                    <Select
                        aria-label={t('knowledge.paragraph')}
                        size='sm'
                        fullWidth={!workspace}
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
                {controls.map((control) => (
                    <ToolbarControl
                        key={control.key}
                        control={control}
                        disabled={disabled}
                        workspace={workspace}
                        iconSize={iconSize}
                    />
                ))}
                {workspace && (
                    <div className={styles.moreFormatting}>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type='button'
                                    className={styles.workspaceTool}
                                    aria-label={t('knowledge.moreFormatting')}
                                    onMouseDown={preserveSelection}
                                >
                                    <Ellipsis size={16} aria-hidden />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                side='bottom'
                                align='end'
                                autoFocus={false}
                                className={styles.moreTools}
                            >
                                {controls
                                    .filter(isExtraControl)
                                    .map((control) => (
                                        <ToolbarControl
                                            key={control.key}
                                            control={control}
                                            disabled={disabled}
                                            workspace={workspace}
                                            iconSize={iconSize}
                                            inPopover
                                        />
                                    ))}
                            </PopoverContent>
                        </Popover>
                    </div>
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

type ToolbarControlModel = ReturnType<
    typeof useKnowledgeEditorToolbar
>['controls'][number];
const extraKeys = new Set([
    'knowledge.underline',
    'knowledge.strike',
    'knowledge.link',
    'knowledge.table',
]);
const groupStarts = new Set([
    'knowledge.bold',
    'knowledge.bulletList',
    'knowledge.link',
    'knowledge.undo',
]);
function isExtraControl(control: ToolbarControlModel) {
    return extraKeys.has(control.key);
}
function ToolbarControl({
    control,
    disabled,
    workspace,
    inPopover = false,
    iconSize,
}: {
    control: ToolbarControlModel;
    disabled: boolean;
    workspace: boolean;
    inPopover?: boolean;
    iconSize: number;
}) {
    const { t } = useI18n();
    const Icon = control.icon;
    const classNames = [workspace ? styles.workspaceTool : styles.tool];
    if (workspace && extraKeys.has(control.key) && !inPopover)
        classNames.push(styles.extraTool);
    if (workspace && groupStarts.has(control.key) && !inPopover)
        classNames.push(styles.groupStart);
    const className = classNames.join(' ');
    function preserveSelection(event: React.MouseEvent) {
        event.preventDefault();
    }
    return (
        <button
            type='button'
            className={className}
            aria-label={t(control.key)}
            title={t(control.key)}
            aria-pressed={control.active}
            disabled={disabled || control.unavailable}
            onMouseDown={preserveSelection}
            onClick={control.action}
        >
            <Icon aria-hidden size={iconSize} />
        </button>
    );
}
