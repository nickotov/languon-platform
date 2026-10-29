import { useState, type ReactNode } from 'react';
import { BookPlus, Copy, Ellipsis, Languages } from 'lucide-react';
import type { LearningBlock, ExerciseLearningBlock } from '@languon/contracts';
import {
    LearningBlockView,
    LearningExerciseSet,
    type LearningBlockViewProps,
} from '@/fsd/entities/learning-blocks';
import { Menu, type MenuItem } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import type { KnowledgeLibraryContext } from '../../api/library-copy-api';
import type { KnowledgeBlockCopyContext } from '../../api/block-copy-api';
import { BlockCopyDialog } from '../block-copy/copy-blocks-to-note';
import { LibrarySaveDialog } from '../library-copy/library-save-dialog';
import { libraryLabels } from '../library-copy/library-labels';
import { localizedBlockLabels } from '../learning-block-authoring/block-locales';
import styles from './knowledge-document-view.module.css';

type BlockOptions = Omit<Partial<LearningBlockViewProps>, 'block' | 'labels'>;
export interface KnowledgeReadingBlockOverrides {
    content?: ReactNode;
    library?: KnowledgeLibraryContext | undefined;
}

export interface ReaderLearningBlockProps {
    block: LearningBlock;
    allBlocks: LearningBlock[];
    group?: ExerciseLearningBlock[] | undefined;
    linked?: ExerciseLearningBlock[] | undefined;
    library?: KnowledgeLibraryContext | undefined;
    blockCopy?: KnowledgeBlockCopyContext | undefined;
    blockOptions?: ((block: LearningBlock) => BlockOptions) | undefined;
    getBlockActions?: ((block: LearningBlock) => MenuItem[]) | undefined;
    renderBlockMenu?:
        ((block: LearningBlock, items: MenuItem[]) => ReactNode) | undefined;
    wrapBlock?:
        | ((
              block: LearningBlock,
              render: (overrides?: KnowledgeReadingBlockOverrides) => ReactNode,
          ) => ReactNode)
        | undefined;
    renderBlockContent?:
        | ((block: LearningBlock, options: BlockOptions) => ReactNode)
        | undefined;
}

/** Read-only block menus open the existing independent-copy/library flows. */
export function ReaderLearningBlock({
    block,
    allBlocks,
    group,
    linked,
    library,
    blockCopy,
    blockOptions,
    getBlockActions,
    renderBlockMenu,
    renderBlockContent,
    wrapBlock,
}: ReaderLearningBlockProps) {
    const { locale } = useI18n();
    const labels = localizedBlockLabels(locale);
    const libraryCopy = libraryLabels(locale);
    const options = blockOptions?.(block) ?? {};
    const [dialog, setDialog] = useState<'copy' | 'library' | null>(null);
    const [expansion, setExpansion] = useState({ open: false, at: 0 });
    const canSave =
        block.type === 'vocabulary' || block.type === 'bilingual-text';
    const title =
        (block.type === 'exercise' ? block.group?.title : undefined) ??
        block.title ??
        labels.view.kinds[block.type];
    function openCopy() {
        setDialog('copy');
    }
    function openLibrary() {
        setDialog('library');
    }
    function close() {
        setDialog(null);
    }
    function toggleTranslations() {
        setExpansion((prior) => ({ open: !prior.open, at: prior.at + 1 }));
    }
    const items: MenuItem[] = [];
    if (blockCopy)
        items.push({
            label: labels.copy,
            icon: <Copy size={16} />,
            onSelect: openCopy,
        });
    if (library && canSave)
        items.push({
            label:
                block.type === 'vocabulary'
                    ? libraryCopy.saveVocabulary
                    : libraryCopy.saveText,
            icon: <BookPlus size={16} />,
            onSelect: openLibrary,
        });
    if (block.type === 'vocabulary')
        items.push({
            label: labels.field(
                expansion.open
                    ? 'Hide all translations'
                    : 'Show all translations',
            ),
            icon: <Languages size={16} />,
            onSelect: toggleTranslations,
        });
    items.push(...(getBlockActions?.(block) ?? []));
    const menuLabel = `${labels.field('Block settings')}: ${title}`;
    let menu: ReactNode = items.length ? (
        <Menu
            label={menuLabel}
            items={items}
            iconOnly
            trigger={<Ellipsis size={16} aria-hidden='true' />}
            triggerClassName={styles.menuTrigger}
        />
    ) : null;
    const customMenu = renderBlockMenu?.(block, items);
    if (customMenu !== null && customMenu !== undefined) menu = customMenu;
    const headingActions = (
        <>
            {options.headingActions}
            {menu}
        </>
    );
    const copied = [
        block,
        ...(group?.filter((item) => item.id !== block.id) ?? []),
        ...(linked ?? []),
    ].map((item) => item.id);
    const variant = options.variant ?? 'learner';
    const entries = (group ?? []).map((item) => ({
        block: item,
        options: blockOptions?.(item),
    }));
    const linkedEntries = (linked ?? []).map((item) => ({
        block: item,
        options: blockOptions?.(item),
    }));
    const additionalContent = (
        <>
            {linkedEntries.length ? (
                <LearningExerciseSet
                    entries={linkedEntries}
                    labels={labels.view}
                    title={labels.view.kinds.exercise}
                    variant={variant}
                    accented={false}
                    hideHeading
                    scope={options.scope}
                />
            ) : null}
            {options.actions}
        </>
    );
    const content = renderBlockContent?.(block, options) ?? options.content;
    function renderDefault(overrides: KnowledgeReadingBlockOverrides = {}) {
        const effectiveLibrary = overrides.library ?? library;
        const effectiveContent = overrides.content ?? content;
        return (
            <>
                {group?.length ? (
                    <LearningExerciseSet
                        entries={entries}
                        labels={labels.view}
                        title={title}
                        variant={variant}
                        accented={options.accented}
                        scope={options.scope}
                        headingLeading={options.headingLeading}
                        headingActions={headingActions}
                    />
                ) : (
                    <LearningBlockView
                        {...options}
                        block={block}
                        labels={labels.view}
                        variant={variant}
                        headingActions={headingActions}
                        expandAll={
                            block.type === 'vocabulary'
                                ? expansion
                                : options.expandAll
                        }
                        actions={additionalContent}
                        content={effectiveContent}
                    />
                )}
                {dialog === 'copy' && blockCopy ? (
                    <BlockCopyDialog
                        context={blockCopy}
                        blocks={allBlocks}
                        initialSelection={copied}
                        onClose={close}
                    />
                ) : null}
                {dialog === 'library' && effectiveLibrary && canSave ? (
                    <LibrarySaveDialog
                        block={block}
                        context={effectiveLibrary}
                        labels={libraryCopy}
                        onClose={close}
                    />
                ) : null}
            </>
        );
    }
    return wrapBlock?.(block, renderDefault) ?? renderDefault();
}
