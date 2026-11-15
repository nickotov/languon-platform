import {
    cloneElement,
    isValidElement,
    type ReactElement,
    type ReactNode,
} from 'react';
import {
    BookOpen,
    ChevronRight,
    FileText,
    Layers,
    ListChecks,
} from 'lucide-react';
import type { ExerciseActivityId } from '@languon/contracts';
import { exerciseActivityCatalog } from '@languon/contracts';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { ExerciseActivityBrowser } from '@/fsd/entities/learning-blocks';
import type { Locale } from '@/fsd/shared/i18n';
import { CommandMenu, CommandMenuItem } from '@/fsd/shared/ui';
import { promptCopy } from '../../../../lib/prompt-copy';
import { usePromptPickerNavigation } from '../../../../hooks/use-prompt-picker-navigation';
import { WorkspaceReferencePicker } from '../workspace-reference-picker/workspace-reference-picker';
import type { WorkspaceReferencePickerProps } from '../workspace-reference-picker/types';
import styles from '../../../styles/contextual-assistant-prompt-common.module.css';

export function PromptPicker({
    locale,
    blocks,
    texts,
    keepSourceFocus = false,
    onResumeTyping,
    onExercise,
    onBlock,
    onPreview,
    onClose,
}: {
    locale: Locale;
    blocks: KnowledgeBlockReference[];
    texts: ReactNode;
    keepSourceFocus?: boolean;
    onResumeTyping?(text: string): void;
    onExercise(id: ExerciseActivityId): void;
    onBlock(id: string): void;
    onPreview(id: ExerciseActivityId): void;
    onClose(): void;
}) {
    const copy = promptCopy(locale);
    const { rootRef, group, query, changeGroup, search, rememberScroll } =
        usePromptPickerNavigation();
    let title = copy.title;
    let searchLabel = copy.searchAll;
    if (group === 'exercises') {
        title = copy.exercises;
        searchLabel = copy.searchExercises;
    } else if (group === 'blocks') {
        title = copy.blocks;
        searchLabel = copy.search;
    }

    function root() {
        changeGroup('root');
    }

    function exercises() {
        changeGroup('exercises');
    }

    function documentBlocks() {
        changeGroup('blocks');
    }

    function textReferences() {
        changeGroup('texts');
    }

    const normalized = query.trim().toLocaleLowerCase(locale);
    const matches = blocks.filter((block) =>
        `${block.type} ${block.title}`
            .toLocaleLowerCase(locale)
            .includes(normalized),
    );
    const textsMatch = copy.texts
        .toLocaleLowerCase(locale)
        .includes(normalized);
    let embeddedTexts = texts;
    if (isValidElement(texts) && texts.type === WorkspaceReferencePicker) {
        embeddedTexts = cloneElement(
            texts as ReactElement<WorkspaceReferencePickerProps>,
            {
                active: group === 'texts',
                onBack: root,
                onClose,
                onResumeTyping,
            },
        );
    }

    const activitiesMatch = exerciseActivityCatalog.some((activity) => {
        const display = activity.locales[locale];

        return `${activity.id} ${display.name} ${display.description}`
            .toLocaleLowerCase(locale)
            .includes(normalized);
    });
    const hasGlobalQuery = group === 'root' && Boolean(query.trim());

    return (
        <div ref={rootRef} onScrollCapture={rememberScroll}>
            <div hidden={group === 'texts'}>
                <CommandMenu
                    title={title}
                    closeLabel={copy.close}
                    onClose={onClose}
                    backLabel={copy.back}
                    onBack={group === 'root' ? undefined : root}
                    searchLabel={searchLabel}
                    query={query}
                    onQueryChange={search}
                    autoFocusSearch={!keepSourceFocus || group !== 'root'}
                    onResumeTyping={onResumeTyping}
                >
                    {group === 'root' && !hasGlobalQuery && (
                        <>
                            <CommandMenuItem
                                icon={<ListChecks size={18} />}
                                label={copy.exercises}
                                trailing={
                                    <>
                                        <span className={styles.count}>
                                            {exerciseActivityCatalog.length}
                                        </span>
                                        <ChevronRight size={14} />
                                    </>
                                }
                                onSelect={exercises}
                            />
                            <CommandMenuItem
                                icon={<Layers size={18} />}
                                label={copy.blocks}
                                trailing={
                                    <>
                                        <span className={styles.count}>
                                            {blocks.length}
                                        </span>
                                        <ChevronRight size={14} />
                                    </>
                                }
                                onSelect={documentBlocks}
                            />
                            <CommandMenuItem
                                icon={<BookOpen size={18} />}
                                label={copy.texts}
                                trailing={<ChevronRight size={14} />}
                                onSelect={textReferences}
                            />
                        </>
                    )}
                    {(group === 'exercises' || hasGlobalQuery) && (
                        <ExerciseActivityBrowser
                            compact
                            hideSearch
                            hideEmpty={hasGlobalQuery}
                            locale={locale}
                            query={query}
                            onChoose={onExercise}
                            onPreview={onPreview}
                        />
                    )}
                    {(group === 'blocks' || hasGlobalQuery) && (
                        <>
                            {hasGlobalQuery && matches.length > 0 && (
                                <p className={styles.caption}>{copy.blocks}</p>
                            )}
                            {matches.map((block) => (
                                <BlockRow
                                    key={block.id}
                                    block={block}
                                    onChoose={onBlock}
                                />
                            ))}
                            {group === 'blocks' && matches.length === 0 && (
                                <p className={styles.empty}>{copy.empty}</p>
                            )}
                        </>
                    )}
                    {hasGlobalQuery &&
                        !activitiesMatch &&
                        !matches.length &&
                        !textsMatch && (
                            <p className={styles.empty} role='status'>
                                {copy.noResults}
                            </p>
                        )}
                    {hasGlobalQuery && textsMatch && (
                        <CommandMenuItem
                            icon={<BookOpen size={18} />}
                            label={copy.texts}
                            trailing={<ChevronRight size={14} />}
                            onSelect={textReferences}
                        />
                    )}
                </CommandMenu>
            </div>
            <div hidden={group !== 'texts'}>{embeddedTexts}</div>
        </div>
    );
}

function BlockRow({
    block,
    onChoose,
}: {
    block: KnowledgeBlockReference;
    onChoose(id: string): void;
}) {
    function choose() {
        onChoose(block.id);
    }

    let Icon = FileText;
    if (block.type === 'exercise') {
        Icon = ListChecks;
    } else if (block.type === 'vocabulary') {
        Icon = Layers;
    }

    return (
        <CommandMenuItem
            icon={<Icon size={18} />}
            label={block.title}
            onSelect={choose}
        />
    );
}
