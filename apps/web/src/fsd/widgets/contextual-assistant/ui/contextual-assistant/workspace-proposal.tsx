import { useState } from 'react';
import type { ConversationEditorTarget } from '@languon/contracts';
import { NotebookPen } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import type { WorkspaceProposalAction } from '../../types';
import styles from './conversation-messages.module.css';

const labels = {
    en: {
        review: 'Use in document',
        heading: 'Review before inserting',
        insert: 'Insert at original cursor',
        append: 'Append to document',
        replace: 'Replace original selection',
        accept: 'Accept edit',
        cancel: 'Cancel',
        applied: 'Added to working draft. You can undo this edit.',
        conflict:
            'The original target changed. Compare the versions or choose a new target.',
        noTarget:
            'The original cursor or selection is unavailable. Choose a new target in the editor.',
    },
    ru: {
        review: 'Добавить в документ',
        heading: 'Проверьте перед вставкой',
        insert: 'Вставить в исходную позицию курсора',
        append: 'Добавить в конец документа',
        replace: 'Заменить исходное выделение',
        accept: 'Применить правку',
        cancel: 'Отмена',
        applied: 'Добавлено в рабочий черновик. Правку можно отменить.',
        conflict:
            'Исходный фрагмент изменился. Сравните версии или выберите новый фрагмент.',
        noTarget:
            'Исходный курсор или выделение недоступны. Выберите новое место в редакторе.',
    },
    es: {
        review: 'Usar en el documento',
        heading: 'Revisar antes de insertar',
        insert: 'Insertar en el cursor original',
        append: 'Añadir al documento',
        replace: 'Reemplazar la selección original',
        accept: 'Aceptar edición',
        cancel: 'Cancelar',
        applied: 'Añadido al borrador. Puedes deshacer esta edición.',
        conflict:
            'El destino original cambió. Compara las versiones o elige otro destino.',
        noTarget:
            'El cursor o la selección original no está disponible. Elige otro destino.',
    },
    fr: {
        review: 'Utiliser dans le document',
        heading: 'Vérifier avant insertion',
        insert: 'Insérer au curseur initial',
        append: 'Ajouter au document',
        replace: 'Remplacer la sélection initiale',
        accept: 'Accepter la modification',
        cancel: 'Annuler',
        applied: 'Ajouté au brouillon. Vous pouvez annuler cette modification.',
        conflict:
            'La cible initiale a changé. Comparez les versions ou choisissez une autre cible.',
        noTarget:
            'Le curseur ou la sélection initiale est indisponible. Choisissez une nouvelle cible.',
    },
};

export function WorkspaceProposal({
    content,
    targetId,
    anchor,
    turnId,
    onAccept,
}: {
    content: string;
    targetId?: string | undefined;
    anchor?: ConversationEditorTarget | undefined;
    turnId: string | null;
    onAccept(
        content: string,
        action: WorkspaceProposalAction,
        turnId: string | null,
        anchor?: ConversationEditorTarget,
    ): Promise<'applied' | 'changed' | 'missing' | undefined>;
}) {
    const { locale } = useI18n();
    const copy = labels[locale];
    const [open, setOpen] = useState(false);
    const [action, setAction] = useState<WorkspaceProposalAction>('append');
    const [status, setStatus] = useState('');
    const [pending, setPending] = useState(false);
    function review() {
        setOpen(true);
        setStatus('');
    }
    function cancel() {
        setOpen(false);
    }
    function choose(event: React.ChangeEvent<HTMLSelectElement>) {
        setAction(event.target.value as WorkspaceProposalAction);
        setStatus('');
    }
    async function accept() {
        if (pending) return;
        if (
            (action !== 'append' && !targetId && !anchor) ||
            (action === 'replace' && anchor?.from === anchor?.to)
        ) {
            setStatus(copy.noTarget);
            return;
        }
        setPending(true);
        try {
            const result = await onAccept(content, action, turnId, anchor);
            if (result === 'applied') {
                setStatus(copy.applied);
                setOpen(false);
            } else if (result === 'changed' || result === 'missing') {
                setStatus(copy.conflict);
            }
        } catch {
            setStatus(copy.conflict);
        } finally {
            setPending(false);
        }
    }
    return (
        <div className={styles.proposal}>
            <button type='button' className={styles.quiet} onClick={review}>
                <NotebookPen size={14} aria-hidden='true' />
                {copy.review}
            </button>
            {open && (
                <section
                    className={styles.proposalReview}
                    aria-label={copy.heading}
                >
                    <strong>{copy.heading}</strong>
                    <pre dir='auto'>{content}</pre>
                    <select
                        value={action}
                        onChange={choose}
                        aria-label={copy.heading}
                    >
                        <option value='append'>{copy.append}</option>
                        <option value='insert' disabled={!targetId && !anchor}>
                            {copy.insert}
                        </option>
                        <option
                            value='replace'
                            disabled={
                                anchor ? anchor.from === anchor.to : !targetId
                            }
                        >
                            {copy.replace}
                        </option>
                    </select>
                    <div className={styles.proposalActions}>
                        <button
                            type='button'
                            onClick={cancel}
                            disabled={pending}
                        >
                            {copy.cancel}
                        </button>
                        <button
                            type='button'
                            onClick={() => void accept()}
                            disabled={pending}
                        >
                            {copy.accept}
                        </button>
                    </div>
                </section>
            )}
            {status && (
                <p role='status' className={styles.notice}>
                    {status}
                </p>
            )}
        </div>
    );
}
