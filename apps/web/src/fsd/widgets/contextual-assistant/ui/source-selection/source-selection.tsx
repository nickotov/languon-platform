import { useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, MessageSquarePlus, Paperclip } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { useSourceSelection } from '../../hooks/use-source-selection';
import styles from './source-selection.module.css';

const labels = {
    en: {
        ask: 'Ask tutor',
        attach: 'Attach to question',
        copy: 'Copy',
        copied: 'Copied',
        actions: 'Selected text actions',
        failed: 'Could not copy. Use your browser’s Copy action.',
    },
    ru: {
        ask: 'Спросить тьютора',
        attach: 'Добавить к вопросу',
        copy: 'Копировать',
        copied: 'Скопировано',
        actions: 'Действия с выделением',
        failed: 'Не удалось скопировать. Используйте копирование в браузере.',
    },
    es: {
        ask: 'Preguntar al tutor',
        attach: 'Adjuntar a la pregunta',
        copy: 'Copiar',
        copied: 'Copiado',
        actions: 'Acciones del texto seleccionado',
        failed: 'No se pudo copiar. Usa Copiar en el navegador.',
    },
    fr: {
        ask: 'Demander au tuteur',
        attach: 'Joindre à la question',
        copy: 'Copier',
        copied: 'Copié',
        actions: 'Actions du texte sélectionné',
        failed: 'Copie impossible. Utilisez Copier dans le navigateur.',
    },
};

export function SourceSelection({
    rootId,
    selecting,
    onAttach,
}: {
    rootId?: string | undefined;
    selecting: boolean;
    onAttach(text: string): void;
}) {
    const { locale } = useI18n();
    const copy = labels[locale];
    const selection = useSourceSelection(rootId);
    const [copied, setCopied] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    if (!selection) return null;
    const current = selection;
    const isCopied = copied === current.text;
    const attachLabel = selecting ? copy.attach : copy.ask;
    function keepSelection(event: MouseEvent) {
        event.preventDefault();
    }
    function attach() {
        onAttach(current.text);
        window.getSelection()?.removeAllRanges();
    }
    async function copySelection() {
        try {
            await navigator.clipboard.writeText(current.text);
            setCopied(current.text);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }
    const position = { top: current.top, left: current.left };
    return createPortal(
        <div
            className={styles.toolbar}
            style={position}
            role='toolbar'
            aria-label={copy.actions}
            onMouseDown={keepSelection}
        >
            <button className={styles.attach} type='button' onClick={attach}>
                {selecting ? (
                    <Paperclip aria-hidden />
                ) : (
                    <MessageSquarePlus aria-hidden />
                )}
                {attachLabel}
            </button>
            <button
                className={styles.copy}
                type='button'
                onClick={copySelection}
            >
                {isCopied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {isCopied ? copy.copied : copy.copy}
            </button>
            {failed && <span role='alert'>{copy.failed}</span>}
        </div>,
        document.body,
    );
}
