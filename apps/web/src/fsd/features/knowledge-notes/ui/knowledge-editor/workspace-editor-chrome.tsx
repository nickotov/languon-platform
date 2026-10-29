'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeWorkspaceEditorOptions } from '../knowledge-note-form/knowledge-note-form';
import { EditorToolbar } from './editor-toolbar';
import styles from './workspace-editor-chrome.module.css';
import { WorkspaceSelectionActions } from './workspace-selection-actions';
import { WorkspaceEmptyStarters } from './workspace-empty-starters';

export function WorkspaceEditorChrome({
    editor,
    disabled,
    workspace,
    children,
    authoring,
}: {
    editor: Editor;
    disabled: boolean;
    workspace: KnowledgeWorkspaceEditorOptions;
    children: ReactNode;
    authoring?: ReactNode;
}) {
    const { t } = useI18n();
    const [toolbarRoot, setToolbarRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setToolbarRoot(document.getElementById(workspace.toolbarRootId));
    }, [workspace.toolbarRootId]);
    const selection = editor.state.selection;
    const passage = editor.state.doc.textBetween(
        selection.from,
        selection.to,
        '\n',
    );
    const hasSelection =
        selection instanceof TextSelection &&
        !selection.empty &&
        passage.trim().length > 1 &&
        !editor.isActive('table');
    const toolbar = (
        <EditorToolbar
            editor={editor}
            disabled={disabled}
            variant='workspace'
        />
    );
    return (
        <div className={styles.root} data-workspace-editor>
            {toolbarRoot ? createPortal(toolbar, toolbarRoot) : toolbar}
            {hasSelection && !disabled && (
                <WorkspaceSelectionActions
                    editor={editor}
                    workspace={workspace}
                    passage={passage}
                />
            )}
            <div
                className={styles.prose}
                data-empty={editor.isEmpty}
                data-placeholder={t('knowledge.editorPlaceholder')}
            >
                {children}
            </div>
            {editor.isEmpty && (
                <WorkspaceEmptyStarters
                    editor={editor}
                    workspace={workspace}
                    disabled={disabled}
                />
            )}
            {authoring}
            {workspace.inlineProposalRootId && (
                <div
                    id={workspace.inlineProposalRootId}
                    className={styles.inlineProposalRoot}
                />
            )}
        </div>
    );
}
