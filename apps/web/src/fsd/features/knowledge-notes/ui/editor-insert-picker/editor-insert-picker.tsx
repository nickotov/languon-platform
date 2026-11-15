'use client';
import { useMemo } from 'react';
import type { Editor } from '@tiptap/react';
import {
    getExerciseActivity,
    type ExerciseActivityId,
} from '@languon/contracts';
import {
    ExerciseActivityBrowser,
    ExerciseActivityPreview,
} from '@/fsd/entities/learning-blocks';
import {
    Button,
    Input,
    InlineAlert,
    Popover,
    PopoverTrigger,
    PopoverAnchor,
    PopoverContent,
} from '@/fsd/shared/ui';
import { useEditorInsertActions } from '../../hooks/use-editor-insert-actions';
import type { BlockKind } from '../../lib/learning-block-form';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import { InsertDialog } from '../library-copy/insert-library-dialog/insert-library-dialog';
import { libraryLabels } from '../library-copy/library-labels';
import type { BlockAuthoringLabels } from '../learning-block-authoring/block-labels';
import { CommandRow } from './ui/command-row/command-row';
import { BlockEditorPanel } from '../learning-block-authoring/ui/block-editor-panel/block-editor-panel';
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
    const {
        locale,
        copy,
        picker,
        level,
        query,
        activityId,
        preview,
        error,
        libraryOpen,
        changeOpen,
        search,
        back,
        exercises,
        choose,
        showPreview,
        closePreview,
        showCurrentPreview,
        manual,
        custom,
        customSet,
        generate,
        openLibrary,
        closeLibrary,
        insertLibrary,
        keyboard,
        basic,
        basicLabel,
        matches,
        applyBasic,
    } = useEditorInsertActions(editor, disabled, onGenerateExercise);

    const virtualAnchor = useMemo(
        () => ({
            getBoundingClientRect() {
                const range = picker.target.current?.resolve();
                const point = editor.view.coordsAtPos(
                    range?.from ?? editor.state.selection.from,
                );

                return DOMRect.fromRect({
                    x: point.left,
                    y: point.top,
                    width: 1,
                    height: point.bottom - point.top,
                });
            },
        }),
        [editor, picker.target],
    );
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
        <div className={styles.contents} onKeyDown={keyboard}>
            {' '}
            {level !== 'root' && (
                <Button size='small' variant='ghost' onClick={back}>
                    {copy.back}
                </Button>
            )}
            <Input
                label={copy.search}
                value={query}
                onChange={search}
                autoFocus
            />
            {level === 'root' && (
                <>
                    <h3>{copy.basic}</h3>
                    {basic
                        .filter((kind) => matches(basicLabel(kind)))
                        .map((kind) => (
                            <CommandRow
                                key={kind}
                                value={kind}
                                label={basicLabel(kind)}
                                onSelect={applyBasic}
                            />
                        ))}
                    <h3>{copy.learning}</h3>
                    {(
                        [
                            'bilingual-text',
                            'vocabulary',
                            'grammar',
                            'audio',
                            'video',
                        ] as BlockKind[]
                    )
                        .filter((kind) => matches(labels.view.kinds[kind]))
                        .map((kind) => (
                            <CommandRow
                                key={kind}
                                value={kind}
                                label={labels.view.kinds[kind]}
                                onSelect={manual}
                            />
                        ))}
                    <Button variant='ghost' onClick={exercises}>
                        {copy.exercises}
                    </Button>
                    {library && (
                        <Button variant='ghost' onClick={openLibrary}>
                            {copy.library}
                        </Button>
                    )}
                </>
            )}
            {(level === 'exercises' ||
                (level === 'root' && query.trim().length > 0)) && (
                <>
                    <ExerciseActivityBrowser
                        hideSearch
                        locale={locale}
                        query={query}
                        onChoose={choose}
                        onPreview={showPreview}
                    />
                    <CommandRow
                        value='exercise'
                        label={copy.custom}
                        onSelect={manual}
                    />
                    <Button variant='ghost' onClick={customSet}>
                        {copy.customSet}
                    </Button>
                </>
            )}
            {level === 'activity' && (
                <>
                    <h3>
                        {getExerciseActivity(activityId).locales[locale].name}
                    </h3>
                    <Button
                        variant='ghost'
                        onClick={generate}
                        disabled={!onGenerateExercise}
                    >
                        {copy.generate}
                    </Button>
                    <Button variant='ghost' onClick={custom}>
                        {copy.manual}
                    </Button>
                    <Button variant='ghost' onClick={showCurrentPreview}>
                        {copy.preview}
                    </Button>
                </>
            )}
            {error && (
                <InlineAlert tone='error'>{copy.unavailable}</InlineAlert>
            )}
        </div>
    );

    return (
        <>
            <Popover open={picker.open} onOpenChange={changeOpen}>
                <PopoverTrigger disabled={disabled}>
                    {labels.add}
                </PopoverTrigger>
                {picker.openedBySlash && (
                    <PopoverAnchor virtualRef={virtualAnchor} />
                )}
                {!picker.narrow && (
                    <PopoverContent
                        className={styles.panel}
                        aria-label={copy.title}
                        closeOnFocusOut={false}
                    >
                        {contents}
                    </PopoverContent>
                )}
            </Popover>
            {picker.open && picker.narrow && (
                <BlockEditorPanel
                    kind='exercise'
                    title={copy.title}
                    subtitle=''
                    labels={labels}
                    onClose={picker.close}
                    footer={
                        <Button variant='secondary' onClick={picker.close}>
                            {labels.cancel}
                        </Button>
                    }
                >
                    {contents}
                </BlockEditorPanel>
            )}
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
