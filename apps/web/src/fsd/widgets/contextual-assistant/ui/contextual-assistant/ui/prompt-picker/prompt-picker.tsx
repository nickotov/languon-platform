import {
    useState,
    useEffect,
    useRef,
    type ReactNode,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import type { ExerciseActivityId } from '@languon/contracts';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { ExerciseActivityBrowser } from '@/fsd/entities/learning-blocks';
import type { Locale } from '@/fsd/shared/i18n';
import { Button, Input } from '@/fsd/shared/ui';
import { promptCopy } from '../../../../lib/prompt-copy';
import styles from '../../../styles/contextual-assistant-prompt-common.module.css';

export function PromptPicker({
    locale,
    blocks,
    texts,
    onExercise,
    onBlock,
    onPreview,
    onClose,
}: {
    locale: Locale;
    blocks: KnowledgeBlockReference[];
    texts: ReactNode;
    onExercise(id: ExerciseActivityId): void;
    onBlock(id: string): void;
    onPreview(id: ExerciseActivityId): void;
    onClose(): void;
}) {
    const rootRef = useRef<HTMLElement>(null);
    const copy = promptCopy(locale);
    const [group, setGroup] = useState<
        'root' | 'exercises' | 'blocks' | 'texts'
    >('root');
    const [query, setQuery] = useState('');
    useEffect(() => {
        rootRef.current?.querySelector<HTMLElement>('input,button')?.focus();
    }, [group]);

    function root() {
        setGroup('root');
    }

    function exercises() {
        setGroup('exercises');
    }

    function documentBlocks() {
        setGroup('blocks');
    }

    function textReferences() {
        setGroup('texts');
    }

    function search(event: ChangeEvent<HTMLInputElement>) {
        setQuery(event.target.value);
    }

    function key(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            if (group === 'root') {
                onClose();
            } else {
                root();
            }
        }
    }

    const matches = blocks.filter((block) =>
        `${block.type} ${block.title}`
            .toLocaleLowerCase(locale)
            .includes(query.toLocaleLowerCase(locale)),
    );

    return (
        <section
            ref={rootRef}
            role='dialog'
            aria-label={copy.title}
            className={styles.picker}
            onKeyDown={key}
        >
            <div className={styles.actions}>
                {group !== 'root' && (
                    <Button variant='ghost' size='compact' onClick={root}>
                        {copy.back}
                    </Button>
                )}
                <Button variant='ghost' size='compact' onClick={onClose}>
                    {copy.close}
                </Button>
            </div>
            {group === 'root' && (
                <div className={styles.list}>
                    <Button variant='secondary' onClick={exercises}>
                        {copy.exercises}
                    </Button>
                    <Button variant='secondary' onClick={documentBlocks}>
                        {copy.blocks}
                    </Button>
                    <Button variant='secondary' onClick={textReferences}>
                        {copy.texts}
                    </Button>
                </div>
            )}
            {group === 'exercises' && (
                <ExerciseActivityBrowser
                    locale={locale}
                    onChoose={onExercise}
                    onPreview={onPreview}
                />
            )}
            {group === 'blocks' && (
                <>
                    <Input
                        label={copy.search}
                        value={query}
                        onChange={search}
                    />
                    <div className={styles.list}>
                        {matches.map((block) => (
                            <BlockRow
                                key={block.id}
                                block={block}
                                onChoose={onBlock}
                            />
                        ))}
                        {matches.length === 0 && <p>{copy.empty}</p>}
                    </div>
                </>
            )}
            {group === 'texts' && texts}
        </section>
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

    return (
        <button type='button' className={styles.row} onClick={choose}>
            {block.title}
        </button>
    );
}
