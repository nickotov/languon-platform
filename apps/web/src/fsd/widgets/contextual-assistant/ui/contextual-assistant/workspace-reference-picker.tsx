import {
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { CopiedAttachment } from '@languon/contracts';
import {
    conversationApi,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState } from '@/fsd/shared/ui';
import styles from './composer.module.css';

const labels = {
    en: {
        search: 'Search your Texts',
        empty: 'No matching Texts',
        error: 'Could not load Texts',
        source: 'Source text',
        translation: 'Include translation',
        passage:
            'Select a shorter passage in the source, then use the selection button.',
        selectPassage: 'Use selected passage',
        fullText: 'Use full text',
        add: 'Attach to message',
        back: 'Back to Texts',
        close: 'Close references',
    },
    ru: {
        search: 'Поиск по вашим текстам',
        empty: 'Тексты не найдены',
        error: 'Не удалось загрузить тексты',
        source: 'Исходный текст',
        translation: 'Добавить перевод',
        passage:
            'Выделите короткий отрывок в источнике и нажмите кнопку выбора.',
        selectPassage: 'Использовать выделенный отрывок',
        fullText: 'Использовать полный текст',
        add: 'Прикрепить к сообщению',
        back: 'Назад к текстам',
        close: 'Закрыть материалы',
    },
    es: {
        search: 'Buscar en tus Textos',
        empty: 'No hay Textos coincidentes',
        error: 'No se pudieron cargar los Textos',
        source: 'Texto original',
        translation: 'Incluir traducción',
        passage:
            'Selecciona un pasaje más corto en el texto y usa el botón de selección.',
        selectPassage: 'Usar el pasaje seleccionado',
        fullText: 'Usar el texto completo',
        add: 'Adjuntar al mensaje',
        back: 'Volver a Textos',
        close: 'Cerrar referencias',
    },
    fr: {
        search: 'Rechercher dans vos Textes',
        empty: 'Aucun Texte trouvé',
        error: 'Impossible de charger les Textes',
        source: 'Texte source',
        translation: 'Inclure la traduction',
        passage:
            'Sélectionnez un passage plus court dans le texte puis utilisez le bouton.',
        selectPassage: 'Utiliser le passage sélectionné',
        fullText: 'Utiliser le texte entier',
        add: 'Joindre au message',
        back: 'Retour aux Textes',
        close: 'Fermer les références',
    },
};

export function WorkspaceReferencePicker({
    actorId,
    conversationId,
    request,
    onAttach,
    onClose,
}: {
    actorId: string;
    conversationId: string;
    request: ConversationSessionRequest;
    onAttach(attachment: CopiedAttachment): boolean;
    onClose(): void;
}) {
    const { locale } = useI18n();
    const copy = labels[locale];
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [passage, setPassage] = useState('');
    const [translation, setTranslation] = useState('');
    const [includeTranslation, setIncludeTranslation] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const sourceRef = useRef<HTMLTextAreaElement>(null);
    const translationRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => searchRef.current?.focus(), []);
    const results = useQuery({
        queryKey: ['workspace-references', actorId, conversationId, query],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.references(
                    token,
                    conversationId,
                    query,
                    signal,
                ),
            ),
        retry: false,
    });
    const detail = useQuery({
        queryKey: ['workspace-reference', actorId, conversationId, selectedId],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.reference(
                    token,
                    conversationId,
                    selectedId!,
                    signal,
                ),
            ),
        enabled: Boolean(selectedId),
        retry: false,
    });
    const reference = detail.data?.reference;
    useEffect(() => {
        setPassage(reference?.content ?? '');
        setTranslation(reference?.translation ?? '');
        setIncludeTranslation(false);
    }, [reference]);
    function search(event: ChangeEvent<HTMLInputElement>) {
        setQuery(event.target.value);
    }
    function useSourceSelection() {
        const node = sourceRef.current;
        if (!node || node.selectionStart === node.selectionEnd) return;
        setPassage(node.value.slice(node.selectionStart, node.selectionEnd));
    }
    function useFullSource() {
        setPassage(reference?.content ?? '');
    }
    function useTranslationSelection() {
        const node = translationRef.current;
        if (!node || node.selectionStart === node.selectionEnd) return;
        setTranslation(
            node.value.slice(node.selectionStart, node.selectionEnd),
        );
    }
    function useFullTranslation() {
        setTranslation(reference?.translation ?? '');
    }
    function toggleTranslation(event: ChangeEvent<HTMLInputElement>) {
        setIncludeTranslation(event.target.checked);
    }
    function back() {
        setSelectedId(null);
        searchRef.current?.focus();
    }
    function attach() {
        if (!reference || !passage.trim()) return;
        const accepted = onAttach({
            id: crypto.randomUUID(),
            kind: 'text-reference',
            label: reference.title,
            content: passage,
            sourceLanguage: reference.sourceLanguage,
            ...(includeTranslation && translation.trim()
                ? {
                      translation,
                      translationLanguage:
                          reference.translationLanguage ?? undefined,
                  }
                : {}),
        });
        if (accepted) onClose();
    }
    function key(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        if (selectedId) back();
        else onClose();
    }
    return (
        <section
            className={styles.picker}
            role='dialog'
            aria-label={copy.search}
            onKeyDown={key}
        >
            <div className={styles.searchRow}>
                {selectedId ? (
                    <button
                        type='button'
                        onClick={back}
                        aria-label={copy.back}
                        className={styles.removeAttachment}
                    >
                        <ArrowLeft size={16} aria-hidden='true' />
                    </button>
                ) : (
                    <Search size={16} aria-hidden='true' />
                )}
                <input
                    ref={searchRef}
                    className={styles.search}
                    aria-label={copy.search}
                    placeholder={copy.search}
                    value={query}
                    onChange={search}
                    hidden={Boolean(selectedId)}
                />
                {selectedId && <strong dir='auto'>{reference?.title}</strong>}
                <button
                    type='button'
                    onClick={onClose}
                    aria-label={copy.close}
                    className={styles.removeAttachment}
                >
                    <X size={16} aria-hidden='true' />
                </button>
            </div>
            {selectedId ? (
                <div className={styles.results}>
                    {detail.isPending && (
                        <LoadingState>{copy.search}</LoadingState>
                    )}
                    {detail.isError && <p role='alert'>{copy.error}</p>}
                    {reference && (
                        <div className={styles.referenceEditor}>
                            <p className={styles.hint}>{copy.passage}</p>
                            <label>
                                {copy.source}
                                <textarea
                                    ref={sourceRef}
                                    value={reference.content}
                                    readOnly
                                    rows={6}
                                    dir='auto'
                                />
                            </label>
                            <div className={styles.referenceActions}>
                                <button
                                    type='button'
                                    onClick={useSourceSelection}
                                >
                                    {copy.selectPassage}
                                </button>
                                <button type='button' onClick={useFullSource}>
                                    {copy.fullText}
                                </button>
                            </div>
                            <p className={styles.hint}>{passage}</p>
                            {reference.translation && (
                                <>
                                    <label className={styles.referenceCheckbox}>
                                        <input
                                            type='checkbox'
                                            checked={includeTranslation}
                                            onChange={toggleTranslation}
                                        />
                                        {copy.translation}
                                    </label>
                                    {includeTranslation && (
                                        <>
                                            <textarea
                                                ref={translationRef}
                                                value={reference.translation}
                                                readOnly
                                                rows={4}
                                                dir='auto'
                                                aria-label={copy.translation}
                                            />
                                            <div
                                                className={
                                                    styles.referenceActions
                                                }
                                            >
                                                <button
                                                    type='button'
                                                    onClick={
                                                        useTranslationSelection
                                                    }
                                                >
                                                    {copy.selectPassage}
                                                </button>
                                                <button
                                                    type='button'
                                                    onClick={useFullTranslation}
                                                >
                                                    {copy.fullText}
                                                </button>
                                            </div>
                                            <p className={styles.hint}>
                                                {translation}
                                            </p>
                                        </>
                                    )}
                                </>
                            )}
                            <button
                                type='button'
                                onClick={attach}
                                disabled={!passage.trim()}
                            >
                                {copy.add}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className={styles.results}>
                    {results.isPending && (
                        <LoadingState>{copy.search}</LoadingState>
                    )}
                    {results.isError && <p role='alert'>{copy.error}</p>}
                    {results.data?.references.length === 0 && (
                        <p>{copy.empty}</p>
                    )}
                    {results.data?.references.map((item) => (
                        <ReferenceRow
                            key={item.id}
                            id={item.id}
                            title={item.title}
                            onSelect={setSelectedId}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

function ReferenceRow({
    id,
    title,
    onSelect,
}: {
    id: string;
    title: string;
    onSelect(id: string): void;
}) {
    function select() {
        onSelect(id);
    }
    return (
        <button
            type='button'
            className={styles.result}
            onClick={select}
            dir='auto'
        >
            {title}
        </button>
    );
}
