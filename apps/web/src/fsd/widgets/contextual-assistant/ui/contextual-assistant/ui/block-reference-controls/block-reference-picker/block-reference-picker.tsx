import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import { Check, Layers, Search } from 'lucide-react';
import {
    knowledgeLearningBlockLabels,
    type KnowledgeBlockReference,
} from '@/fsd/features/knowledge-notes';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { blockReferenceCopy } from '../../../../../lib/block-reference-copy';
import styles from '../../../../styles/contextual-assistant-block-reference-controls-common.module.css';

export function BlockReferencePicker({
    available,
    selected,
    onAdd,
    onRemove,
    onClose,
    onTexts,
}: {
    available: KnowledgeBlockReference[];
    selected: KnowledgeBlockReference[];
    onAdd(id: string): void;
    onRemove(id: string): void;
    onClose(): void;
    onTexts(): void;
}) {
    const { locale } = useI18n();
    const copy = blockReferenceCopy(locale);
    const kinds = knowledgeLearningBlockLabels(locale).view.kinds;
    const [query, setQuery] = useState('');
    const search = useRef<HTMLInputElement>(null);
    useEffect(() => {
        search.current?.focus();
    }, []);

    function change(event: ChangeEvent<HTMLInputElement>) {
        setQuery(event.target.value);
    }

    function key(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
        }
    }

    const matches = available.filter((item) =>
        `${item.title} ${kinds[item.type]}`
            .toLocaleLowerCase(locale)
            .includes(query.toLocaleLowerCase(locale)),
    );

    return (
        <section
            role='dialog'
            aria-label={copy.blocks}
            className={styles.picker}
            onKeyDown={key}
        >
            <div className={styles.header}>
                <strong>{copy.blocks}</strong>
                <Button variant='ghost' size='compact' onClick={onTexts}>
                    {copy.texts}
                </Button>
            </div>
            <label className={styles.search}>
                <Search size={16} aria-hidden />
                <input
                    ref={search}
                    aria-label={copy.search}
                    placeholder={copy.search}
                    value={query}
                    onChange={change}
                />
            </label>
            {selected.length >= 8 && <p role='status'>{copy.limit}</p>}
            <div className={styles.results}>
                {matches.slice(0, 50).map((item) => (
                    <ReferenceOption
                        key={item.id}
                        item={item}
                        selected={selected.some(
                            (current) => current.id === item.id,
                        )}
                        disabled={selected.length >= 8}
                        onAdd={onAdd}
                        onRemove={onRemove}
                    />
                ))}
                {matches.length === 0 && <p>{copy.empty}</p>}
            </div>
            <Button size='compact' onClick={onClose}>
                {copy.done}
            </Button>
        </section>
    );
}

function ReferenceOption({
    item,
    selected,
    disabled,
    onAdd,
    onRemove,
}: {
    item: KnowledgeBlockReference;
    selected: boolean;
    disabled: boolean;
    onAdd(id: string): void;
    onRemove(id: string): void;
}) {
    const { locale } = useI18n();
    const kind = knowledgeLearningBlockLabels(locale).view.kinds[item.type];
    function choose() {
        if (selected) {
            onRemove(item.id);
        } else {
            onAdd(item.id);
        }
    }

    return (
        <button
            type='button'
            className={styles.option}
            aria-pressed={selected}
            disabled={disabled && !selected}
            onClick={choose}
        >
            <Layers size={16} aria-hidden />
            <span>
                <strong dir='auto'>{item.title || kind}</strong>
                <small>{kind}</small>
            </span>
            {selected && <Check size={16} aria-hidden />}
        </button>
    );
}
