import { Library, ListPlus } from 'lucide-react';
import { exerciseActivityCatalog } from '@languon/contracts';
import { ExerciseActivityBrowser } from '@/fsd/entities/learning-blocks';
import { CommandMenuItem, InlineAlert } from '@/fsd/shared/ui';
import type { useEditorInsertActions } from '../../../../hooks/use-editor-insert-actions';
import { editorCommandResults } from '../../../../lib/editor-command-results';
import type { BlockAuthoringLabels } from '../../../learning-block-authoring/block-labels';
import { CategoryCommands } from '../category-commands/category-commands';
import { ActivityCommands } from '../activity-commands/activity-commands';
import { CommandRow } from '../command-row/command-row';
import styles from './editor-command-results.module.css';

export function EditorCommandResults({
    actions,
    labels,
    hasLibrary,
    canGenerate,
}: {
    actions: ReturnType<typeof useEditorInsertActions>;
    labels: BlockAuthoringLabels;
    hasLibrary: boolean;
    canGenerate: boolean;
}) {
    const {
        locale,
        copy,
        level,
        query,
        exercises,
        basics,
        learning,
        choose,
        showPreview,
        showCurrentPreview,
        manual,
        custom,
        customSet,
        generate,
        openLibrary,
        basic,
        basicLabel,
        matches,
        applyBasic,
        error,
    } = actions;
    const { normalized, basicMatches, learningMatches, activityMatches } =
        editorCommandResults({ query, locale, basic, basicLabel, labels });
    const globalSearch = level === 'root' && Boolean(normalized);
    const rootCategories = level === 'root' && !globalSearch;
    const basicsVisible = level === 'basic' || globalSearch;
    const learningVisible = level === 'learning' || globalSearch;
    const exercisesVisible = level === 'exercises' || globalSearch;
    const libraryMatches = hasLibrary && matches(copy.library);
    const hasMatches =
        basicMatches.length > 0 ||
        learningMatches.length > 0 ||
        activityMatches ||
        matches(copy.custom) ||
        matches(copy.customSet) ||
        libraryMatches;
    const libraryAction = hasLibrary ? openLibrary : undefined;
    const emptyResults =
        (globalSearch && !hasMatches) ||
        (level === 'basic' && !basicMatches.length) ||
        (level === 'learning' && !learningMatches.length) ||
        (level === 'exercises' &&
            !activityMatches &&
            !matches(copy.custom) &&
            !matches(copy.customSet));

    return (
        <>
            {rootCategories && (
                <CategoryCommands
                    copy={copy}
                    count={exerciseActivityCatalog.length}
                    onBasic={basics}
                    onLearning={learning}
                    onExercises={exercises}
                    onLibrary={libraryAction}
                />
            )}
            {basicsVisible && basicMatches.length > 0 && (
                <section className={styles.group}>
                    {globalSearch && <h3>{copy.basic}</h3>}
                    {basicMatches.map((kind) => (
                        <CommandRow
                            key={kind}
                            value={kind}
                            label={basicLabel(kind)}
                            onSelect={applyBasic}
                        />
                    ))}
                </section>
            )}
            {learningVisible && learningMatches.length > 0 && (
                <section className={styles.group}>
                    {globalSearch && <h3>{copy.learning}</h3>}
                    {learningMatches.map((kind) => (
                        <CommandRow
                            key={kind}
                            value={kind}
                            label={labels.view.kinds[kind]}
                            onSelect={manual}
                        />
                    ))}
                </section>
            )}
            {exercisesVisible && (
                <>
                    <ExerciseActivityBrowser
                        compact
                        hideSearch
                        hideEmpty
                        locale={locale}
                        query={query}
                        onChoose={choose}
                        onPreview={showPreview}
                    />
                    {matches(copy.custom) && (
                        <CommandRow
                            value='exercise'
                            label={copy.custom}
                            onSelect={manual}
                        />
                    )}
                    {matches(copy.customSet) && (
                        <CommandMenuItem
                            icon={<ListPlus size={18} aria-hidden='true' />}
                            label={copy.customSet}
                            onSelect={customSet}
                        />
                    )}
                </>
            )}
            {globalSearch && libraryMatches && (
                <CommandMenuItem
                    icon={<Library size={18} aria-hidden='true' />}
                    label={copy.library}
                    onSelect={openLibrary}
                />
            )}
            {emptyResults && (
                <p className={styles.empty} role='status'>
                    {copy.empty}
                </p>
            )}
            {level === 'activity' && (
                <ActivityCommands
                    copy={copy}
                    disabled={!canGenerate}
                    onGenerate={generate}
                    onCustom={custom}
                    onPreview={showCurrentPreview}
                />
            )}
            {error && (
                <InlineAlert tone='error'>{copy.unavailable}</InlineAlert>
            )}
        </>
    );
}
