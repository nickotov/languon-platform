'use client';

import {
    forwardRef,
    useEffect,
    useId,
    useState,
    type ChangeEvent,
    type MouseEvent,
    type ReactNode,
} from 'react';
import {
    KnowledgeNoteContentSchema,
    type KnowledgeWorkingContent,
} from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { Input } from '@/fsd/shared/ui';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../knowledge-editor/knowledge-editor';
import styles from './knowledge-note-form.module.css';
import { WorkspaceTitle } from './workspace-title';
import { NoteMetadata } from './note-metadata';

export type KnowledgeTutorAction =
    'explain' | 'correct' | 'translate' | 'simplify' | 'rephrase' | 'examples';

export type KnowledgeWorkspaceEditorOptions = {
    blockCopy?: KnowledgeBlockCopyContext | undefined;
    library?: KnowledgeLibraryContext | undefined;
    uploadAudio?: ((file: File) => Promise<{ assetId: string }>) | undefined;
    preparationTools?: ReactNode;
    toolbarRootId: string;
    editorId: string;
    proposalRootId: string;
    inlineProposalRootId?: string;
    onAskTutor(passage: string): void;
    onAskOutline(): void;
    onTutorAction?(action: KnowledgeTutorAction, passage: string): void;
    onTitleVisibilityChange?(visible: boolean): void;
    tutorBusy?: boolean;
};

export const KnowledgeNoteForm = forwardRef<
    KnowledgeEditorHandle,
    {
        value: KnowledgeWorkingContent;
        onChange(
            update: (
                current: KnowledgeWorkingContent,
            ) => KnowledgeWorkingContent,
        ): void;
        workspace?: KnowledgeWorkspaceEditorOptions;
        disabled?: boolean;
        error?: string | undefined;
        onValidityChange?: ((valid: boolean) => void) | undefined;
    }
>(function KnowledgeNoteForm(
    { value, onChange, disabled = false, error, onValidityChange, workspace },
    ref,
) {
    const { t } = useI18n();
    const id = useId();
    const [editorValid, setEditorValid] = useState(true);
    const valid =
        editorValid && KnowledgeNoteContentSchema.safeParse(value).success;
    useEffect(() => {
        onValidityChange?.(valid);
    }, [onValidityChange, valid]);
    function field<Key extends keyof KnowledgeWorkingContent>(
        key: Key,
        next: KnowledgeWorkingContent[Key],
    ) {
        onChange((current) => ({ ...current, [key]: next }));
    }
    function changeTitle(event: ChangeEvent<HTMLInputElement>) {
        field('title', event.target.value);
    }
    function changeWorkspaceTitle(title: string) {
        field('title', title);
    }
    function changeBody(body: KnowledgeWorkingContent['body']) {
        field('body', body);
    }
    function focusDocument(event: MouseEvent<HTMLElement>) {
        if (workspace && event.target === event.currentTarget) {
            event.currentTarget
                .querySelector<HTMLElement>('[role="textbox"]')
                ?.focus();
        }
    }
    const EditorContainer = workspace ? 'article' : 'div';
    const formClassName = workspace ? styles.workspaceForm : styles.form;
    const explanationClassName = workspace
        ? styles.article
        : styles.explanation;
    return (
        <div className={formClassName}>
            {!workspace && (
                <Input
                    label={t('knowledge.noteTitle')}
                    value={value.title}
                    maxLength={200}
                    required
                    disabled={disabled}
                    onChange={changeTitle}
                />
            )}
            {!workspace && (
                <NoteMetadata
                    value={value}
                    onChange={onChange}
                    workspace={false}
                    disabled={disabled}
                />
            )}
            {workspace && (
                <div
                    id={workspace.proposalRootId}
                    className={styles.proposalRoot}
                />
            )}
            <EditorContainer
                className={explanationClassName}
                id={workspace?.editorId}
                aria-label={workspace ? t('knowledge.document') : undefined}
                onClick={focusDocument}
            >
                <div className={workspace ? styles.readingColumn : undefined}>
                    {workspace && (
                        <WorkspaceTitle
                            value={value.title}
                            disabled={disabled}
                            onChange={changeWorkspaceTitle}
                            onVisibilityChange={
                                workspace.onTitleVisibilityChange
                            }
                        />
                    )}
                    {workspace && (
                        <NoteMetadata
                            value={value}
                            onChange={onChange}
                            workspace
                            disabled={disabled}
                        />
                    )}
                    {!workspace && (
                        <span id={id} className={styles.label}>
                            {t('knowledge.document')}
                        </span>
                    )}
                    <KnowledgeEditor
                        ref={ref}
                        workspace={workspace}
                        value={value.body}
                        onChange={changeBody}
                        disabled={disabled}
                        label={t('knowledge.document')}
                        onValidityChange={setEditorValid}
                    />
                    {workspace?.preparationTools}
                </div>
            </EditorContainer>
            {error && (
                <p className={styles.error} role='alert'>
                    {error}
                </p>
            )}
        </div>
    );
});
