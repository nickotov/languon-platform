'use client';

import type { Editor } from '@tiptap/react';
import {
    getExerciseActivity,
    type ExerciseActivityId,
} from '@languon/contracts';
import { ExerciseActivityPreview } from '@/fsd/entities/learning-blocks';
import {
    Button,
    CommandMenu,
    Popover,
    PopoverTrigger,
    PopoverAnchor,
    PopoverContent,
} from '@/fsd/shared/ui';
import { useEditorInsertActions } from '../../hooks/use-editor-insert-actions';
import { useEditorInsertAnchor } from '../../hooks/use-editor-insert-anchor';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { InsertDialog } from '../library-copy/insert-library-dialog/insert-library-dialog';
import { libraryLabels } from '../library-copy/library-labels';
import type { BlockAuthoringLabels } from '../learning-block-authoring/block-labels';
import { EditorCommandResults } from './ui/editor-command-results/editor-command-results';
import styles from './editor-insert-picker.module.css';

export function EditorInsertPicker({
    editor,
    disabled,
    labels,
    onGenerateExercise,
    library,
}: {
    editor: Editor;
    disabled: boolean;
    labels: BlockAuthoringLabels;
    onGenerateExercise?: ((id: ExerciseActivityId) => void) | undefined;
    library?: KnowledgeLibraryContext | undefined;
}) {
    const actions = useEditorInsertActions(
        editor,
        disabled,
        onGenerateExercise,
    );
    const {
        locale,
        copy,
        picker,
        level,
        query,
        activityId,
        preview,
        libraryOpen,
        changeOpen,
        search,
        back,
        closePreview,
        custom,
        generate,
        closeLibrary,
        insertLibrary,
        restoringFocus,
    } = actions;
    const titles = {
        root: copy.title,
        basic: copy.basic,
        learning: copy.learning,
        exercises: copy.exercises,
        activity: getExerciseActivity(activityId).locales[locale].name,
    };
    const title = titles[level];
    const virtualAnchor = useEditorInsertAnchor(editor, picker.target);
    const previewActions = (
        <>
            <Button onClick={generate} disabled={!onGenerateExercise}>
                {copy.generate}
            </Button>
            <Button variant='secondary' onClick={custom}>
                {copy.manual}
            </Button>
        </>
    );
    const contents = (
        <CommandMenu
            title={title}
            closeLabel={copy.close}
            onClose={picker.close}
            backLabel={copy.back}
            onBack={level === 'root' ? undefined : back}
            searchLabel={level === 'activity' ? undefined : copy.search}
            query={query}
            onQueryChange={search}
            autoFocusSearch={!picker.openedBySlash && !restoringFocus}
            onResumeTyping={picker.resumeTyping}
        >
            <EditorCommandResults
                actions={actions}
                labels={labels}
                hasLibrary={Boolean(library)}
                canGenerate={Boolean(onGenerateExercise)}
            />
        </CommandMenu>
    );

    return (
        <>
            <Popover open={picker.open} onOpenChange={changeOpen}>
                <PopoverTrigger
                    ref={picker.triggerRef}
                    disabled={disabled}
                    onKeyDown={(event) => {
                        if (picker.open && event.key === 'Escape') {
                            event.preventDefault();
                            picker.close();
                        }
                    }}
                >
                    {labels.add}
                </PopoverTrigger>
                {picker.openedBySlash && (
                    <PopoverAnchor
                        className={styles.anchor}
                        virtualRef={virtualAnchor}
                    />
                )}
                <PopoverContent
                    ref={picker.panelRef}
                    className={styles.panel}
                    aria-label={copy.title}
                    autoFocus={false}
                    dismissOnEscape={false}
                    returnFocus={!picker.openedBySlash}
                    closeOnFocusOut={false}
                    align='start'
                >
                    {contents}
                </PopoverContent>
            </Popover>
            {preview && (
                <ExerciseActivityPreview
                    activityId={preview}
                    locale={locale}
                    open
                    onClose={closePreview}
                    footer={previewActions}
                />
            )}
            {libraryOpen && library && (
                <InsertDialog
                    context={library}
                    labels={libraryLabels(locale)}
                    onClose={closeLibrary}
                    onInsert={insertLibrary}
                    disabled={disabled}
                />
            )}
        </>
    );
}
